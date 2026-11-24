import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@memo/shared';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser, RequestWithUser } from '../../common/types';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

const COOKIE_NAME = 'memo_session';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  private setCookie(res: Response, token: string): void {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: 7 * 86_400_000,
      path: '/',
    });
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Créer un compte étudiant et ouvrir une session' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: unknown,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(body as never, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Se connecter' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body as never, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setCookie(res, result.token);
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Fermer la session courante' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return this.auth.logout(user);
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Fermer toutes les sessions du compte' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return this.auth.logoutAll(user);
  }

  @Get('me')
  @ApiOperation({ summary: 'Profil du compte connecté' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Mettre à jour son profil et ses préférences' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: Record<string, unknown>,
  ) {
    const { preferences, ...rest } = body as {
      preferences?: Record<string, unknown>;
      [key: string]: unknown;
    };

    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { preferences: true },
    });
    const mergedPreferences = {
      ...(typeof current.preferences === 'object' && current.preferences !== null
        ? (current.preferences as Record<string, unknown>)
        : {}),
      ...(preferences ?? {}),
    };

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(rest.displayName !== undefined ? { displayName: rest.displayName as string } : {}),
        ...(rest.institution !== undefined ? { institution: (rest.institution as string | null) ?? null } : {}),
        ...(rest.level !== undefined ? { level: (rest.level as string | null) ?? null } : {}),
        ...(rest.field !== undefined ? { field: (rest.field as string | null) ?? null } : {}),
        ...(rest.specialty !== undefined ? { specialty: (rest.specialty as string | null) ?? null } : {}),
        ...(rest.goal !== undefined ? { goal: (rest.goal as string | null) ?? null } : {}),
        ...(rest.locale !== undefined ? { locale: rest.locale as string } : {}),
        preferences: mergedPreferences as object,
      },
    });
    return this.auth.serializeUser(updated);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Demander un lien de réinitialisation (réponse constante)' })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string },
    @Req() req: RequestWithUser,
  ) {
    return this.auth.requestPasswordReset(body.email, { ip: req.ip });
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe avec un jeton' })
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string }) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Changer son mot de passe (révoque les autres sessions)' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
  ) {
    return this.auth.changePassword(user, body.currentPassword, body.newPassword);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Lister les sessions actives' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Révoquer une session distante' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.prisma.session.updateMany({
      where: { id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new UnauthorizedException({ code: 'SESSION_NOT_FOUND', message: 'Session introuvable.' });
    }
    return { success: true };
  }

  @Get('export')
  @ApiOperation({ summary: 'Exporter toutes ses données (JSON, RGPD)' })
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.exportData(user);
  }

  @Delete('account')
  @ApiOperation({ summary: 'Supprimer définitivement son compte' })
  deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: { password: string; confirmation: string },
  ) {
    return this.auth.deleteAccount(user, body.password, body.confirmation);
  }
}
