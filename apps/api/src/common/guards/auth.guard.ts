import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@memo/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser, RequestWithUser } from '../types';

export const PUBLIC_KEY = 'memo:public';
export const ROLES_KEY = 'memo:roles';

/** Marque une route comme accessible sans session (ex. /auth/login). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Restreint une route à certains rôles (contrôle serveur, pas seulement UI). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) throw new UnauthorizedException('Session requise');
    return request.user;
  },
);

/**
 * Authentification par jeton JWT **et** vérification de la session en base.
 *
 * Pourquoi les deux ? Un JWT seul ne peut pas être révoqué (déconnexion,
 * changement de mot de passe, compte désactivé). Chaque requête vérifie donc
 * que la session correspondante est active : coût = 1 requête indexée, gain =
 * révocation immédiate. C'est le compromis retenu pour un produit commercial.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractToken(request);
    if (!token) {
      throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Vous devez vous connecter.' });
    }

    let payload: { sub: string; sid: string; role: Role };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Session expirée, reconnectez-vous.' });
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, email: true, role: true, planCode: true, institutionId: true, isActive: true, deletedAt: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Votre session a expiré.' });
    }
    if (!session.user.isActive || session.user.deletedAt) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Ce compte est désactivé.' });
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role as Role,
      planCode: session.user.planCode,
      institutionId: session.user.institutionId,
      sessionId: session.id,
    };

    // Trace d'usage (mise à jour non bloquante : ne doit jamais faire échouer la requête).
    void this.prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: "Votre compte n'a pas les droits nécessaires pour cette action.",
      });
    }

    return true;
  }
}

function extractToken(request: RequestWithUser): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (request as unknown as { cookies?: Record<string, string> }).cookies?.['memo_session'];
  return cookie ?? null;
}
