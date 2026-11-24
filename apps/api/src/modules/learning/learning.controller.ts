import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  prioritizeRevisions,
  scheduleReview,
  type ReviewPace,
  type ReviewState,
} from '@memo/shared';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { PedagogyService } from '../ai/pedagogy.service';

const generateSchema = z.object({
  documentId: z.string().uuid(),
  count: z.coerce.number().int().min(1).max(40).default(12),
  subjectId: z.string().uuid().optional(),
});

const reviewSchema = z.object({
  flashcardId: z.string().uuid(),
  grade: z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']),
  durationMs: z.number().int().min(0).max(600000).default(0),
});

/**
 * Mémorisation durable (§7) : rappel actif + répétition espacée.
 * Toutes les décisions d'ordonnancement sont calculées côté serveur, à partir
 * de l'état réellement stocké — l'application mobile ne peut pas « tricher ».
 */
@ApiTags('Révisions')
@Controller('learning')
export class LearningController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedagogy: PedagogyService,
    private readonly quota: QuotaService,
  ) {}

  @Post('flashcards/generate')
  @ApiOperation({ summary: 'Générer des cartes mémoire à partir d’un cours analysé' })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(generateSchema)) body: { documentId: string; count: number; subjectId?: string },
  ) {
    await this.quota.enforce(user.id, user.planCode, 'ai_generations_per_month');
    return this.pedagogy.generateFlashcards({
      userId: user.id,
      documentId: body.documentId,
      count: body.count,
      subjectId: body.subjectId ?? null,
    });
  }

  @Get('flashcards')
  @ApiOperation({ summary: 'Lister ses cartes mémoire (filtres, pagination)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('subjectId') subjectId?: string,
    @Query('documentId') documentId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const pageSize = 30;
    const where = {
      userId: user.id,
      ...(subjectId ? { subjectId } : {}),
      ...(documentId ? { documentId } : {}),
      ...(status ? { masteryStatus: status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.flashcard.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
        include: { subject: { select: { name: true, color: true } } },
      }),
      this.prisma.flashcard.count({ where }),
    ]);
    return { items, total, page: pageNumber, pageSize };
  }

  /**
   * Révisions du jour, ordonnées avec justification.
   * Croise les cartes dues, la maîtrise réelle et les examens planifiés à venir.
   */
  @Get('reviews/today')
  @ApiOperation({ summary: 'Révisions prioritaires du jour, avec explication du choix' })
  async today(@CurrentUser() user: AuthenticatedUser) {
    const now = new Date();
    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { preferences: true },
    });
    const preferences = (profile.preferences ?? {}) as { dailyReviewLimit?: number; reviewPace?: ReviewPace };
    const limit = preferences.dailyReviewLimit ?? 20;

    const cards = await this.prisma.flashcard.findMany({
      where: { userId: user.id, suspended: false, dueAt: { lte: new Date(now.getTime() + 86_400_000) } },
      take: 200,
      include: { subject: { select: { id: true, name: true, color: true } } },
    });

    const exams = await this.prisma.planningBlock.findMany({
      where: { userId: user.id, type: 'EXAMEN', startAt: { gte: now } },
      select: { subjectId: true, startAt: true },
    });
    const examBySubject = new Map<string, Date>();
    for (const exam of exams) {
      if (exam.subjectId) examBySubject.set(exam.subjectId, exam.startAt);
    }

    const prioritized = prioritizeRevisions(
      cards.map((card) => ({
        id: card.id,
        dueAt: card.dueAt,
        masteryScore: card.masteryScore,
        lapses: card.lapses,
        daysUntilExam: card.subjectId && examBySubject.has(card.subjectId)
          ? Math.ceil((examBySubject.get(card.subjectId)!.getTime() - now.getTime()) / 86_400_000)
          : undefined,
      })),
      now,
      limit,
    );

    const byId = new Map(cards.map((card) => [card.id, card]));
    return {
      totalDue: cards.length,
      pace: preferences.reviewPace ?? 'NORMAL',
      items: prioritized.map((item) => {
        const card = byId.get(item.id);
        return {
          id: item.id,
          question: card?.question ?? '',
          answer: card?.answer ?? '',
          hint: card?.hint ?? null,
          subject: card?.subject ?? null,
          masteryScore: item.masteryScore,
          masteryStatus: card?.masteryStatus ?? 'NOUVELLE',
          dueAt: item.dueAt,
          priority: item.priority,
          why: item.why,
        };
      }),
    };
  }

  /** Enregistre une réponse de rappel actif et reprogramme la carte. */
  @Post('reviews')
  @ApiOperation({ summary: 'Soumettre une révision (AGAIN/HARD/GOOD/EASY) et reprogrammer' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reviewSchema)) body: { flashcardId: string; grade: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY'; durationMs: number },
  ) {
    const card = await this.prisma.flashcard.findFirst({
      where: { id: body.flashcardId, userId: user.id },
    });
    if (!card) {
      throw new NotFoundException({ code: 'CARD_NOT_FOUND', message: 'Carte mémoire introuvable.' });
    }

    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { preferences: true },
    });
    const pace = ((profile.preferences ?? {}) as { reviewPace?: ReviewPace }).reviewPace ?? 'NORMAL';

    const state: ReviewState = {
      ease: card.ease,
      intervalDays: card.intervalDays,
      repetitions: card.repetitions,
      lapses: card.lapses,
      dueAt: card.dueAt,
      lastReviewedAt: card.lastReviewedAt,
    };
    const outcome = scheduleReview(state, body.grade, { pace });

    const [updated] = await this.prisma.$transaction([
      this.prisma.flashcard.update({
        where: { id: card.id },
        data: {
          ease: outcome.ease,
          intervalDays: outcome.intervalDays,
          repetitions: outcome.repetitions,
          lapses: outcome.lapses,
          dueAt: outcome.dueAt,
          lastReviewedAt: outcome.lastReviewedAt,
          masteryScore: outcome.masteryScore,
          masteryStatus: outcome.masteryStatus,
        },
      }),
      this.prisma.reviewLog.create({
        data: {
          userId: user.id,
          flashcardId: card.id,
          grade: body.grade,
          durationMs: body.durationMs,
          intervalBefore: card.intervalDays,
          intervalAfter: outcome.intervalDays,
        },
      }),
    ]);

    // Mise à jour du niveau de maîtrise du chapitre associé (statistiques).
    if (card.chapterId) {
      const chapterCards = await this.prisma.flashcard.findMany({
        where: { userId: user.id, chapterId: card.chapterId },
        select: { masteryScore: true, masteryStatus: true },
      });
      const average = Math.round(
        chapterCards.reduce((sum, c) => sum + c.masteryScore, 0) / Math.max(1, chapterCards.length),
      );
      await this.prisma.chapterProgress.upsert({
        where: { userId_chapterId: { userId: user.id, chapterId: card.chapterId } },
        create: {
          userId: user.id,
          chapterId: card.chapterId,
          masteryScore: average,
          status: outcome.masteryStatus,
          reviewedCount: 1,
        },
        update: {
          masteryScore: average,
          status: outcome.masteryStatus,
          reviewedCount: { increment: 1 },
          lastActivityAt: new Date(),
        },
      });
    }

    return {
      flashcard: {
        id: updated.id,
        dueAt: updated.dueAt,
        intervalDays: updated.intervalDays,
        masteryScore: updated.masteryScore,
        masteryStatus: updated.masteryStatus,
      },
      explanation: outcome.reason,
    };
  }

  /** Signaler soi-même « compris » / « oublié » (contrôle utilisateur, §7). */
  @Post('flashcards/:id/flag')
  @ApiOperation({ summary: 'Signaler une notion comme comprise ou oubliée' })
  async flag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { understood: boolean },
  ) {
    return this.submit(user, { flashcardId: id, grade: body.understood ? 'EASY' : 'AGAIN', durationMs: 0 });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques d’apprentissage (maîtrise, séries, temps)' })
  async stats(@CurrentUser() user: AuthenticatedUser) {
    const [cards, reviews, sessions, assessments] = await Promise.all([
      this.prisma.flashcard.findMany({
        where: { userId: user.id },
        select: { masteryStatus: true, masteryScore: true, dueAt: true },
      }),
      this.prisma.reviewLog.findMany({
        where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        select: { createdAt: true, grade: true },
      }),
      this.prisma.studySession.aggregate({
        where: { userId: user.id, completed: true },
        _sum: { focusMinutes: true },
        _count: true,
      }),
      this.prisma.assessment.findMany({
        where: { userId: user.id, submittedAt: { not: null } },
        select: { percentage: true, submittedAt: true, title: true },
        orderBy: { submittedAt: 'desc' },
        take: 30,
      }),
    ]);

    const byStatus = cards.reduce<Record<string, number>>((acc, card) => {
      acc[card.masteryStatus] = (acc[card.masteryStatus] ?? 0) + 1;
      return acc;
    }, {});

    const dueToday = cards.filter((card) => card.dueAt <= new Date(Date.now() + 86_400_000)).length;

    const last30Days: { date: string; reviews: number }[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      last30Days.push({
        date: day,
        reviews: reviews.filter((review) => review.createdAt.toISOString().slice(0, 10) === day).length,
      });
    }

    const averageScore =
      assessments.length > 0
        ? Number((assessments.reduce((sum, a) => sum + (a.percentage ?? 0), 0) / assessments.length).toFixed(1))
        : null;

    return {
      cards: {
        total: cards.length,
        dueToday,
        byStatus,
        averageMastery:
          cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.masteryScore, 0) / cards.length) : 0,
      },
      reviews: { last30Days, totalLast30Days: reviews.length },
      study: { totalFocusMinutes: sessions._sum.focusMinutes ?? 0, sessions: sessions._count },
      assessments: {
        count: assessments.length,
        averageScore,
        recent: assessments.slice(0, 8).map((a) => ({
          title: a.title,
          percentage: a.percentage,
          submittedAt: a.submittedAt,
        })),
      },
    };
  }
}
