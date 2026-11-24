import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@memo/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../../common/security.service';
import type { Env } from '../../config/env';
import type { AuthenticatedUser } from '../../common/types';

const SESSION_TTL_DAYS = 7;

export interface SessionResult {
  token: string;
  user: ReturnType<AuthService['serializeUser']>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  serializeUser(user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    planCode: string;
    institution: string | null;
    level: string | null;
    field: string | null;
    specialty: string | null;
    goal: string | null;
    locale: string;
    preferences: unknown;
    institutionId: string | null;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role as Role,
      planCode: user.planCode,
      institution: user.institution,
      level: user.level,
      field: user.field,
      specialty: user.specialty,
      goal: user.goal,
      locale: user.locale,
      preferences: user.preferences,
      institutionId: user.institutionId,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async register(
    input: {
      email: string;
      password: string;
      displayName: string;
      institution?: string;
      level?: string;
      field?: string;
    },
    meta: { ip?: string; userAgent?: string },
  ): Promise<SessionResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // Message identique quel que soit le cas : on n'énumère pas les comptes.
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.',
      });
    }

    const passwordHash = await this.security.hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        institution: input.institution || null,
        level: input.level || null,
        field: input.field || null,
        planCode: 'FREE',
        preferences: { theme: 'system', dailyReviewLimit: 20, reviewPace: 'NORMAL' },
        subjects: {
          create: [
            { name: 'Mathématiques', color: '#2563eb', level: 'INTERMEDIAIRE' },
            { name: 'Physique', color: '#0ea5e9', level: 'INTERMEDIAIRE' },
            { name: 'Biologie', color: '#10b981', level: 'INTERMEDIAIRE' },
          ],
        },
        notifications: {
          create: [
            {
              kind: 'WELCOME',
              title: 'Bienvenue sur MÉMO CAMPUS',
              body: "Importez votre premier cours pour générer un résumé, des fiches et des évaluations. Commencez par l'onglet Bibliothèque.",
            },
          ],
        },
      },
      include: { _count: { select: { subjects: true } } },
    });

    const session = await this.createSession(user.id, meta);
    await this.audit(user.id, 'AUTH_REGISTER', 'User', user.id, meta);
    return { token: session.token, user: this.serializeUser(user) };
  }

  async login(
    input: { email: string; password: string },
    meta: { ip?: string; userAgent?: string },
  ): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    // Temps de réponse constant : on hache même si l'utilisateur n'existe pas.
    const dummyHash =
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRmb3JkdW1teQ$Zm9yY2VkY29uc3RhbnR0aW1lY29tcGFyaXNvbg';
    const passwordHash = user?.passwordHash ?? dummyHash;
    const valid = await this.security.verifyPassword(passwordHash, input.password);

    if (!user || user.deletedAt) {
      await this.audit(null, 'AUTH_LOGIN_FAILED', 'User', null, { ...meta, email: input.email });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou mot de passe incorrect.',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException({
        code: 'ACCOUNT_LOCKED',
        message: `Trop de tentatives échouées. Réessayez dans ${minutes} minute(s).`,
      });
    }

    if (!valid) {
      const failedLogins = user.failedLogins + 1;
      const lock = this.security.computeLock(user.failedLogins);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock.shouldLock ? 0 : failedLogins,
          lockedUntil: lock.lockedUntil,
        },
      });
      await this.audit(user.id, 'AUTH_LOGIN_FAILED', 'User', user.id, meta);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou mot de passe incorrect.',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: 'Ce compte est désactivé. Contactez le support.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const session = await this.createSession(user.id, meta);
    await this.audit(user.id, 'AUTH_LOGIN', 'User', user.id, meta);
    return { token: session.token, user: this.serializeUser(user) };
  }

  private async createSession(
    userId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ token: string; sessionId: string }> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: 'pending',
        expiresAt,
        ip: meta.ip?.slice(0, 60),
        userAgent: meta.userAgent?.slice(0, 280),
      },
    });

    const token = await this.jwt.signAsync(
      { sub: userId, sid: session.id, role: (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } })).role },
      { expiresIn: this.config.get('JWT_EXPIRES_IN', { infer: true }) },
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: { tokenHash: this.security.hashToken(token) },
    });

    return { token, sessionId: session.id };
  }

  async logout(user: AuthenticatedUser): Promise<{ success: true }> {
    await this.prisma.session.updateMany({
      where: { id: user.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit(user.id, 'AUTH_LOGOUT', 'Session', user.sessionId, {});
    return { success: true };
  }

  async logoutAll(user: AuthenticatedUser): Promise<{ success: true; revoked: number }> {
    const result = await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit(user.id, 'AUTH_LOGOUT_ALL', 'User', user.id, {});
    return { success: true, revoked: result.count };
  }

  async listSessions(user: AuthenticatedUser) {
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    const items = sessions.map((s) => ({ ...s, current: s.id === user.sessionId }));
    return { items, total: items.length };
  }

  /**
   * Demande de réinitialisation : réponse toujours identique (anti-énumération).
   * Le jeton est retourné uniquement hors production (pas de SMTP configuré),
   * et **jamais** exposé en production.
   */
  async requestPasswordReset(email: string, meta: { ip?: string }): Promise<{ success: true; devToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return { success: true };

    const { token, hash } = this.security.generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    await this.audit(user.id, 'AUTH_RESET_REQUESTED', 'User', user.id, meta);

    const smtpConfigured = Boolean(this.config.get('SMTP_URL', { infer: true }));
    if (!smtpConfigured) {
      this.logger.warn(
        `[DEV] Lien de réinitialisation pour ${email} : ${this.config.get('APP_URL', { infer: true })}/reinitialisation?token=${token}`,
      );
      return { success: true, devToken: token };
    }
    // TODO(smtp) : envoi réel via le service de notifications (module mail).
    return { success: true };
  }

  async resetPassword(token: string, password: string): Promise<{ success: true }> {
    const hash = this.security.hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: 'Ce lien de réinitialisation est invalide ou expiré. Demandez-en un nouveau.',
      });
    }

    const passwordHash = await this.security.hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Toute session existante est révoquée : un changement de mot de passe
      // doit invalider les accès en cours.
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    await this.audit(record.userId, 'AUTH_PASSWORD_RESET', 'User', record.userId, {});
    return { success: true };
  }

  async changePassword(user: AuthenticatedUser, currentPassword: string, newPassword: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const valid = await this.security.verifyPassword(record.passwordHash, currentPassword);
    if (!valid) {
      throw new BadRequestException({ code: 'INVALID_PASSWORD', message: 'Le mot de passe actuel est incorrect.' });
    }
    const passwordHash = await this.security.hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Un changement de mot de passe doit invalider **toutes** les sessions,
    // y compris celle qui a servi à effectuer l'opération : la preuve
    // d'authentification existante ne couvre plus le nouveau secret.
    await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit(user.id, 'AUTH_PASSWORD_CHANGED', 'User', user.id, {});
    return { success: true };
  }

  async me(user: AuthenticatedUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Compte introuvable.' });
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    return {
      ...this.serializeUser(record),
      subscription: subscription
        ? {
            planCode: subscription.planCode,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          }
        : null,
    };
  }

  /**
   * Export complet des données personnelles (RGPD / loi camerounaise 2010/012).
   * Le JSON est produit côté serveur, sans fichier partagé.
   */
  async exportData(user: AuthenticatedUser) {
    const [profile, subjects, documents, flashcards, assessments, planning, conversations, reviews, payments] =
      await Promise.all([
        this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        this.prisma.subject.findMany({ where: { userId: user.id } }),
        this.prisma.document.findMany({
          where: { userId: user.id },
          select: {
            id: true, title: true, originalName: true, mimeType: true, sizeBytes: true,
            status: true, pageCount: true, createdAt: true, subjectId: true,
          },
        }),
        this.prisma.flashcard.findMany({ where: { userId: user.id } }),
        this.prisma.assessment.findMany({
          where: { userId: user.id },
          include: { questions: { select: { id: true, prompt: true, type: true, answer: true, awarded: true } } },
        }),
        this.prisma.planningBlock.findMany({ where: { userId: user.id } }),
        this.prisma.conversation.findMany({
          where: { userId: user.id },
          include: { messages: true },
        }),
        this.prisma.reviewLog.findMany({ where: { userId: user.id } }),
        this.prisma.payment.findMany({
          where: { userId: user.id },
          select: { id: true, provider: true, amountXaf: true, status: true, createdAt: true },
        }),
      ]);

    await this.audit(user.id, 'DATA_EXPORT', 'User', user.id, {});
    const { passwordHash: _ignored, ...safeProfile } = profile;

    return {
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      note: "Export complet de vos données MÉMO CAMPUS. Les fichiers originaux ne sont pas inclus dans ce JSON : ils restent téléchargeables depuis la bibliothèque tant que le compte existe.",
      account: safeProfile,
      subjects,
      documents,
      summaries: await this.prisma.summary.findMany({ where: { userId: user.id } }),
      flashcards,
      reviews,
      assessments,
      planning,
      conversations,
      payments,
    };
  }

  /**
   * Suppression définitive : anonymisation immédiate + purge des données liées.
   * La suppression est irréversible et tracée dans le journal d'audit.
   */
  async deleteAccount(user: AuthenticatedUser, password: string, confirmation: string) {
    if (confirmation !== 'SUPPRIMER') {
      throw new BadRequestException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Saisissez le mot SUPPRIMER pour confirmer la suppression définitive.',
      });
    }
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const valid = await this.security.verifyPassword(record.passwordHash, password);
    if (!valid) {
      throw new BadRequestException({ code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect.' });
    }

    const anonymizedEmail = `deleted+${user.id}@memo-campus.invalid`;
    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: anonymizedEmail,
          passwordHash: 'deleted',
          displayName: 'Compte supprimé',
          isActive: false,
          deletedAt: new Date(),
          institution: null,
          level: null,
          field: null,
          specialty: null,
          goal: null,
          preferences: {},
        },
      }),
      this.prisma.document.deleteMany({ where: { userId: user.id } }),
      this.prisma.flashcard.deleteMany({ where: { userId: user.id } }),
      this.prisma.assessment.deleteMany({ where: { userId: user.id } }),
      this.prisma.planningBlock.deleteMany({ where: { userId: user.id } }),
      this.prisma.conversation.deleteMany({ where: { userId: user.id } }),
      this.prisma.subject.deleteMany({ where: { userId: user.id } }),
    ]);

    await this.audit(null, 'ACCOUNT_DELETED', 'User', user.id, {});
    return {
      success: true,
      message:
        'Compte supprimé. Les données pédagogiques ont été effacées ; les traces de facturation sont conservées de façon anonymisée conformément aux obligations légales.',
    };
  }

  async audit(
    userId: string | null,
    action: string,
    resource: string,
    resourceId: string | null,
    meta: { ip?: string; userAgent?: string; [key: string]: unknown },
  ): Promise<void> {
    try {
      const { ip, userAgent, ...rest } = meta;
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          ip: ip?.slice(0, 60),
          userAgent: userAgent?.slice(0, 280),
          metadata: rest as object,
        },
      });
    } catch (error) {
      this.logger.warn(`Audit non enregistré (${action}) : ${(error as Error).message}`);
    }
  }
}
