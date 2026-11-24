import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { planUpsertSchema } from '@memo/shared';
import { CurrentUser, Roles } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';

const userUpdateSchema = z.object({
  role: z.enum(['STUDENT', 'TEACHER', 'INSTITUTION_ADMIN', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  planCode: z.enum(['FREE', 'PREMIUM', 'INSTITUTION']).optional(),
});

const institutionSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,80}$/, 'Identifiant: minuscules, chiffres et tirets').optional(),
  city: z.string().trim().max(120).optional(),
  contactEmail: z.string().email().optional(),
  seats: z.number().int().min(1).max(10000).default(30),
});

/**
 * Espace administrateur (§15).
 * Accès strictement contrôlé : rôle ADMIN vérifié côté serveur, chaque action
 * sensible est journalisée dans `AuditLog`. Les documents privés des étudiants
 * ne sont **pas** consultables ici : seules des métadonnées agrégées le sont.
 */
@ApiTags('Administration')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Indicateurs : utilisateurs, contenus, coûts IA, erreurs' })
  async overview() {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const last7 = new Date(now.getTime() - 7 * 86_400_000);

    const [
      usersTotal, usersActive7, documentsTotal, assessmentsTotal, cardsTotal,
      aiUsage, paymentsPaid, failedDocuments, planUsers, auditRecent, reportsOpen,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: last7 } } }),
      this.prisma.document.count(),
      this.prisma.assessment.count(),
      this.prisma.flashcard.count(),
      this.prisma.aiUsage.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { promptTokens: true, outputTokens: true, costUsdCents: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID', createdAt: { gte: startOfMonth } },
        _sum: { amountXaf: true },
        _count: true,
      }),
      this.prisma.document.count({ where: { status: 'FAILED' } }),
      this.prisma.user.groupBy({ by: ['planCode'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
    ]);

    return {
      users: { total: usersTotal, activeLast7Days: usersActive7, byPlan: planUsers },
      content: { documents: documentsTotal, assessments: assessmentsTotal, flashcards: cardsTotal },
      ai: {
        callsThisMonth: aiUsage._count,
        promptTokens: aiUsage._sum.promptTokens ?? 0,
        outputTokens: aiUsage._sum.outputTokens ?? 0,
        estimatedCostUsdCents: aiUsage._sum.costUsdCents ?? 0,
      },
      revenue: {
        paidThisMonthXaf: paymentsPaid._sum.amountXaf ?? 0,
        transactions: paymentsPaid._count,
      },
      health: { failedDocuments, openReports: reportsOpen },
      recentAudit: auditRecent,
    };
  }

  @Get('users')
  @ApiOperation({ summary: 'Rechercher des comptes (métadonnées uniquement)' })
  async users(@Query('search') search?: string, @Query('page') page?: string) {
    const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const where = search
      ? { OR: [{ email: { contains: search, mode: 'insensitive' as const } }, { displayName: { contains: search, mode: 'insensitive' as const } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (pageNumber - 1) * 25,
        take: 25,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, displayName: true, role: true, planCode: true,
          isActive: true, createdAt: true, lastLoginAt: true,
          _count: { select: { documents: true, assessments: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: pageNumber, pageSize: 25 };
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Modifier un rôle, un statut ou une offre' })
  async updateUser(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: Record<string, unknown>,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Compte introuvable.' });

    const updated = await this.prisma.user.update({
      where: { id },
      data: body as { role?: string; isActive?: boolean; planCode?: string },
      select: { id: true, email: true, role: true, planCode: true, isActive: true },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'ADMIN_USER_UPDATE',
        resource: 'User',
        resourceId: id,
        metadata: body as object,
      },
    });
    return updated;
  }

  @Get('plans')
  @ApiOperation({ summary: 'Lister les offres configurables' })
  plans() {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @Post('plans')
  @ApiOperation({ summary: 'Créer ou mettre à jour une offre (prix et quotas)' })
  async upsertPlan(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(planUpsertSchema))
    body: { code: 'FREE' | 'PREMIUM' | 'INSTITUTION'; name: string; description: string; priceXafMonthly: number; priceXafYearly: number; quotas: Record<string, number>; features: string[]; isActive: boolean },
  ) {
    const plan = await this.prisma.plan.upsert({
      where: { code: body.code },
      create: { ...body },
      update: { ...body },
    });
    await this.prisma.auditLog.create({
      data: { userId: admin.id, action: 'ADMIN_PLAN_UPSERT', resource: 'Plan', resourceId: plan.id, metadata: { code: body.code } },
    });
    return plan;
  }

  @Get('payments')
  @ApiOperation({ summary: 'Suivi des paiements' })
  payments(@Query('status') status?: string) {
    return this.prisma.payment.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, provider: true, planCode: true, amountXaf: true, status: true,
        months: true, createdAt: true, paidAt: true, userId: true, providerRef: true,
      },
    });
  }

  @Get('institutions')
  @ApiOperation({ summary: 'Lister les établissements (offre Institution)' })
  institutions() {
    return this.prisma.institution.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true, groups: true } } },
    });
  }

  @Post('institutions')
  @ApiOperation({ summary: 'Créer un établissement et sa licence' })
  async createInstitution(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(institutionSchema))
    body: { name: string; slug?: string; city?: string; contactEmail?: string; seats: number },
  ) {
    const slug = body.slug ?? body.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const institution = await this.prisma.institution.create({
      data: {
        name: body.name,
        slug,
        city: body.city ?? null,
        contactEmail: body.contactEmail ?? null,
        seats: body.seats,
        licenses: {
          create: { seats: body.seats, expiresAt: new Date(Date.now() + 365 * 86_400_000) },
        },
      },
      include: { licenses: true },
    });
    await this.prisma.auditLog.create({
      data: { userId: admin.id, action: 'ADMIN_INSTITUTION_CREATE', resource: 'Institution', resourceId: institution.id, metadata: { name: body.name } },
    });
    return institution;
  }

  @Get('audit')
  @ApiOperation({ summary: 'Journal d’audit des opérations sensibles' })
  audit(@Query('action') action?: string) {
    return this.prisma.auditLog.findMany({
      where: action ? { action } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Get('reports')
  @ApiOperation({ summary: 'Signalements des utilisateurs' })
  reports() {
    return this.prisma.report.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'Traiter un signalement' })
  async resolveReport(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status: 'RESOLVED' | 'REJECTED' },
  ) {
    const report = await this.prisma.report.update({
      where: { id },
      data: { status: body.status, resolvedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { userId: admin.id, action: 'ADMIN_REPORT_RESOLVE', resource: 'Report', resourceId: id, metadata: { status: body.status } },
    });
    return report;
  }
}

@ApiTags('Signalements')
@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({ summary: 'Signaler un contenu généré problématique' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(z.object({
      targetType: z.enum(['SUMMARY', 'ASSESSMENT', 'FLASHCARD', 'ASSISTANT', 'OTHER']),
      targetId: z.string().uuid().optional(),
      reason: z.string().trim().min(10, 'Décrivez le problème en quelques mots').max(500),
    })))
    body: { targetType: string; targetId?: string; reason: string },
  ) {
    return this.prisma.report.create({
      data: { userId: user.id, targetType: body.targetType, targetId: body.targetId ?? null, reason: body.reason },
    });
  }
}
