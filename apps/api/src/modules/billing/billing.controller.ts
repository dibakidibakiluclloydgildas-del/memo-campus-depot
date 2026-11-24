import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CurrentUser, Public } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaService } from './quota.service';

const checkoutSchema = z.object({
  planCode: z.enum(['PREMIUM', 'INSTITUTION']),
  provider: z.enum(['CAMPAY', 'MTN_MOMO', 'ORANGE_MONEY', 'STRIPE', 'MANUAL']),
  phoneNumber: z.string().trim().regex(/^\+?[0-9 ]{8,18}$/).optional(),
  months: z.coerce.number().int().min(1).max(12).default(1),
});

/**
 * Abonnements et paiements (§14).
 *
 * Principes non négociables :
 *  - sandbox avant production : sans clés fournisseur, l'écran affiche
 *    explicitement « intégration non activée » ; aucun faux paiement réussi ;
 *  - un abonnement n'est activé QUE par un webhook vérifié (signature) et
 *    idempotent — jamais sur une notification non authentifiée ni une capture
 *    d'écran ;
 *  - tous les montants sont lus depuis la table `Plan` (aucun prix en dur).
 */
@ApiTags('Abonnements')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private providerStatus() {
    return {
      CAMPAY: Boolean(this.config.get('CAMPY_API_KEY', { infer: true })),
      STRIPE: Boolean(this.config.get('STRIPE_SECRET_KEY', { infer: true })),
      MTN_MOMO: false,
      ORANGE_MONEY: false,
      MANUAL: true,
    };
  }

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'Offres publiques (prix et quotas configurables)' })
  async plans() {
    const plans = await this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const status = this.providerStatus();
    return {
      plans,
      providers: [
        { code: 'CAMPAY', label: 'Campay (Orange Money, MTN MoMo, cartes)', active: status.CAMPAY, note: status.CAMPAY ? 'Sandbox configuré' : 'Clé API requise — intégration non activée' },
        { code: 'MTN_MOMO', label: 'MTN Mobile Money (API directe)', active: status.MTN_MOMO, note: 'Contrat marchand requis — intégration non activée' },
        { code: 'ORANGE_MONEY', label: 'Orange Money (API directe)', active: status.ORANGE_MONEY, note: 'Contrat marchand requis — intégration non activée' },
        { code: 'STRIPE', label: 'Carte bancaire (Stripe)', active: status.STRIPE, note: status.STRIPE ? 'Configuré' : 'Clé API requise — intégration non activée' },
      ],
      currency: 'XAF',
      paymentNote:
        "Les paiements réels ne sont activés qu'après configuration des clés du prestataire et validation en environnement sandbox. Aucun abonnement n'est activé sans confirmation signée du prestataire.",
    };
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Offre, quotas et consommation actuels' })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.quota.overview(user.id, user.planCode);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Initier un paiement (sandbox) vers une offre supérieure' })
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(checkoutSchema))
    body: { planCode: string; provider: string; phoneNumber?: string; months: number },
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { code: body.planCode } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Cette offre n’existe pas ou n’est plus disponible.' });
    }

    const amount = body.months >= 12 ? plan.priceXafYearly : plan.priceXafMonthly * body.months;
    const status = this.providerStatus()[body.provider as keyof ReturnType<BillingController['providerStatus']>];

    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        provider: body.provider,
        planCode: body.planCode,
        amountXaf: amount,
        months: body.months,
        phoneNumber: body.phoneNumber?.replace(/\s/g, '') ?? null,
        status: 'PENDING',
        metadata: { initiatedFrom: 'web', providerConfigured: status },
      },
    });

    if (!status) {
      return {
        paymentId: payment.id,
        status: 'PENDING',
        amountXaf: amount,
        activated: false,
        message:
          "Cette méthode de paiement n'est pas encore activée : aucune somme n'a été débitée et votre abonnement n'a pas été modifié. Configurez les clés du prestataire (voir documentation/INTEGRATIONS.md) pour activer les paiements réels.",
      };
    }

    // Point d'extension : création de la session de paiement chez le prestataire.
    // L'implémentation Campay/Stripe est branchée ici ; en attendant, la demande
    // est enregistrée et reste PENDING (jamais marquée payée sans webhook).
    return {
      paymentId: payment.id,
      status: 'PENDING',
      amountXaf: amount,
      activated: false,
      message:
        "Demande de paiement enregistrée. L'activation de l'abonnement n'aura lieu qu'après confirmation signée du prestataire (webhook vérifié).",
    };
  }

  @Get('payments')
  @ApiOperation({ summary: 'Historique de ses paiements et reçus' })
  payments(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, provider: true, planCode: true, amountXaf: true, currency: true,
        status: true, months: true, createdAt: true, paidAt: true, receiptUrl: true,
      },
    });
  }

  @Get('payments/:id/receipt')
  @ApiOperation({ summary: 'Reçu d’un paiement confirmé' })
  async receipt(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, userId: user.id, status: 'PAID' },
      include: { user: { select: { displayName: true, email: true } } },
    });
    if (!payment) {
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'Aucun reçu disponible pour ce paiement.' });
    }
    return {
      receiptNumber: `MC-${payment.createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${payment.id.slice(0, 8).toUpperCase()}`,
      issuedAt: payment.paidAt ?? payment.createdAt,
      customer: { name: payment.user.displayName, email: payment.user.email },
      plan: payment.planCode,
      months: payment.months,
      amountXaf: payment.amountXaf,
      currency: payment.currency,
      provider: payment.provider,
      providerRef: payment.providerRef,
    };
  }

  /**
   * Webhook prestataire : signature HMAC obligatoire, idempotence par
   * (provider, externalId). Un événement rejoué ne réactive rien deux fois.
   */
  @Public()
  @Post('webhooks/:provider')
  @ApiOperation({ summary: 'Webhook de confirmation de paiement (signé, idempotent)' })
  async webhook(
    @Param('provider') provider: string,
    @Req() req: { body: Record<string, unknown>; rawBody?: Buffer },
    @Headers('x-memo-signature') signature?: string,
    @Headers('x-campay-signature') campaySignature?: string,
  ) {
    const secret =
      provider === 'STRIPE'
        ? this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true })
        : this.config.get('CAMPY_WEBHOOK_SECRET', { infer: true });

    if (!secret) {
      throw new BadRequestException({
        code: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Aucun secret de webhook configuré : cet événement ne peut pas être vérifié et ne sera pas traité.',
      });
    }

    const payload = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    const provided = campaySignature ?? signature ?? '';
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const valid =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided.toLowerCase()), Buffer.from(expected.toLowerCase()));

    if (!valid) {
      throw new BadRequestException({ code: 'INVALID_SIGNATURE', message: 'Signature de webhook invalide.' });
    }

    const externalId = String(
      (req.body?.externalId as string) ?? (req.body?.id as string) ?? (req.body?.reference as string) ?? '',
    );
    if (!externalId) {
      throw new BadRequestException({ code: 'MISSING_EVENT_ID', message: 'Identifiant d’événement absent.' });
    }

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    if (existing?.processedAt) {
      return { received: true, duplicate: true };
    }

    const event = existing ?? (await this.prisma.webhookEvent.create({
      data: {
        provider,
        externalId,
        eventType: String(req.body?.type ?? req.body?.event ?? 'payment.update'),
        payload: (req.body ?? {}) as object,
      },
    }));

    const providerRef = String(req.body?.paymentRef ?? req.body?.reference ?? externalId);
    const payment = await this.prisma.payment.findFirst({ where: { providerRef } });
    const succeeded = /success|paid|completed|SUCCESSFUL/i.test(String(req.body?.status ?? req.body?.state ?? ''));

    if (payment && succeeded && payment.status !== 'PAID') {
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'PAID', paidAt: new Date(), providerRef },
        }),
        this.prisma.user.update({ where: { id: payment.userId }, data: { planCode: payment.planCode } }),
        this.prisma.subscription.create({
          data: {
            userId: payment.userId,
            planCode: payment.planCode,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + payment.months * 30 * 86_400_000),
            provider,
            providerRef,
          },
        }),
        this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date(), paymentId: payment.id },
        }),
      ]);
    } else {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), error: payment ? 'État non payant ou déjà traité' : 'Paiement inconnu' },
      });
    }

    return { received: true, duplicate: false };
  }
}
