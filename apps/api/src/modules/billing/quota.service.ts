import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  checkQuota,
  quotaOverview,
  type QuotaDecision,
  type QuotaKey,
  type QuotaMap,
  type UsageSnapshot,
} from '@memo/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Application des quotas d'abonnement **côté serveur** (§14, §19).
 * Les limites sont lues dans la table `Plan` : modifiables depuis
 * l'administration sans redéploiement, jamais codées en dur.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPlan(planCode: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (plan) return plan;
    const fallback = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!fallback) {
      throw new NotFoundException({
        code: 'PLAN_MISSING',
        message: "Aucune offre n'est configurée. Lancez `npm run db:seed`.",
      });
    }
    return fallback;
  }

  async usage(userId: string): Promise<UsageSnapshot> {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [documentsTotal, documentsThisMonth, storageAgg, aiGenerations, assessments, assistantMessages, ocrAgg] =
      await Promise.all([
        this.prisma.document.count({ where: { userId, archived: false } }),
        this.prisma.document.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
        this.prisma.document.aggregate({ where: { userId, archived: false }, _sum: { sizeBytes: true } }),
        this.prisma.summary.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
        this.prisma.assessment.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
        this.prisma.conversationMessage.count({
          where: { conversation: { userId }, role: 'user', createdAt: { gte: startOfDay } },
        }),
        this.prisma.document.aggregate({ where: { userId, createdAt: { gte: startOfMonth } }, _sum: { ocrPages: true } }),
      ]);

    return {
      documentsTotal,
      documentsThisMonth,
      aiGenerationsThisMonth: aiGenerations,
      assessmentsThisMonth: assessments,
      assistantMessagesToday: assistantMessages,
      storageMb: Math.ceil((storageAgg._sum.sizeBytes ?? 0) / (1024 * 1024)),
      ocrPagesThisMonth: ocrAgg._sum.ocrPages ?? 0,
    };
  }

  async check(userId: string, planCode: string, key: QuotaKey, amount = 1): Promise<QuotaDecision> {
    const [plan, usage] = await Promise.all([this.getPlan(planCode), this.usage(userId)]);
    return checkQuota({
      key,
      planCode,
      planName: plan.name,
      quotas: (plan.quotas ?? {}) as QuotaMap,
      usage,
      amount,
    });
  }

  /** Lève une 403 explicite (avec message français et suggestion d'offre). */
  async enforce(userId: string, planCode: string, key: QuotaKey, amount = 1): Promise<QuotaDecision> {
    const decision = await this.check(userId, planCode, key, amount);
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: 'QUOTA_EXCEEDED',
        message: decision.reason,
        details: {
          quota: decision.key,
          limit: decision.limit,
          used: decision.used,
          upgradeSuggested: decision.upgradeSuggested,
        },
      });
    }
    return decision;
  }

  async overview(userId: string, planCode: string) {
    const [plan, usage] = await Promise.all([this.getPlan(planCode), this.usage(userId)]);
    return {
      plan: {
        code: plan.code,
        name: plan.name,
        quotas: plan.quotas,
        features: plan.features,
        priceXafMonthly: plan.priceXafMonthly,
        priceXafYearly: plan.priceXafYearly,
      },
      usage,
      quotas: quotaOverview(plan.code, plan.name, (plan.quotas ?? {}) as QuotaMap, usage),
    };
  }
}
