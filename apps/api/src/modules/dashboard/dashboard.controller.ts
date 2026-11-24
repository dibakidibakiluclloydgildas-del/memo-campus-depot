import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Delete } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';

const resourceSchema = z.object({
  subjectId: z.string().uuid().optional(),
  kind: z.enum(['VIDEO', 'EXERCICE', 'ARTICLE', 'MOOC', 'PODCAST']).default('VIDEO'),
  title: z.string().trim().min(3).max(200),
  url: z.string().url().max(500),
  source: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

@ApiTags('Tableau de bord')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Vue d’ensemble : progression, révisions, activité' })
  async overview(@CurrentUser() user: AuthenticatedUser) {
    const now = new Date();
    const startOfWeek = new Date(now.getTime() - 7 * 86_400_000);

    const [
      documentsByStatus, subjects, cards, dueCards, recentReviews,
      assessments, upcoming, studySessions, notifications, quotaOverview,
    ] = await Promise.all([
      this.prisma.document.groupBy({ by: ['status'], where: { userId: user.id, archived: false }, _count: { _all: true } }),
      this.prisma.subject.findMany({
        where: { userId: user.id, archived: false },
        include: { _count: { select: { documents: true, flashcards: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.flashcard.groupBy({ by: ['masteryStatus'], where: { userId: user.id }, _count: { _all: true } }),
      this.prisma.flashcard.count({ where: { userId: user.id, dueAt: { lte: new Date(now.getTime() + 86_400_000) }, suspended: false } }),
      this.prisma.reviewLog.findMany({
        where: { userId: user.id, createdAt: { gte: startOfWeek } },
        select: { createdAt: true, grade: true },
      }),
      this.prisma.assessment.findMany({
        where: { userId: user.id, submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, percentage: true, submittedAt: true, type: true },
      }),
      this.prisma.planningBlock.findMany({
        where: { userId: user.id, startAt: { gte: now }, status: { not: 'ANNULE' } },
        orderBy: { startAt: 'asc' },
        take: 5,
        include: { subject: { select: { name: true, color: true } } },
      }),
      this.prisma.studySession.aggregate({
        where: { userId: user.id, startedAt: { gte: startOfWeek } },
        _sum: { focusMinutes: true },
        _count: true,
      }),
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, body: true, readAt: true, createdAt: true },
      }),
      this.quota.overview(user.id, user.planCode),
    ]);

    const totalDocuments = documentsByStatus.reduce((sum, d) => sum + d._count._all, 0);
    const readyDocuments = documentsByStatus
      .filter((d) => d.status === 'READY' || d.status === 'PARTIAL')
      .reduce((sum, d) => sum + d._count._all, 0);

    const mastery = cards.reduce<Record<string, number>>((acc, c) => {
      acc[c.masteryStatus] = c._count._all;
      return acc;
    }, {});

    const averageAssessmentScore =
      assessments.length > 0
        ? Number(
            (
              (await this.prisma.assessment.aggregate({
                where: { userId: user.id, submittedAt: { not: null } },
                _avg: { percentage: true },
              }))._avg.percentage ?? 0
            ).toFixed(1),
          )
        : null;

    return {
      greeting: buildGreeting(now, user.email),
      library: { totalDocuments, readyDocuments, byStatus: documentsByStatus },
      subjects,
      memory: {
        statuses: mastery,
        totalCards: Object.values(mastery).reduce((a, b) => a + b, 0),
        dueToday: dueCards,
        reviewsLast7Days: recentReviews.length,
        successRateLast7Days:
          recentReviews.length > 0
            ? Math.round((recentReviews.filter((r) => r.grade !== 'AGAIN').length / recentReviews.length) * 100)
            : null,
      },
      assessments: { recent: assessments, averageScore: averageAssessmentScore },
      planning: { upcoming },
      study: {
        focusMinutesLast7Days: studySessions._sum.focusMinutes ?? 0,
        sessionsLast7Days: studySessions._count,
      },
      notifications,
      subscription: {
        plan: quotaOverview.plan,
        usage: quotaOverview.usage,
        quotas: quotaOverview.quotas,
      },
    };
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Liste des notifications' })
  notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Post('notifications/:id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  async readNotification(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  /** Favoris de ressources : l'URL doit être fournie par l'utilisateur, jamais inventée. */
  @Get('resources')
  @ApiOperation({ summary: 'Ressources et vidéos enregistrées (favoris)' })
  resources(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.resourceFavorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('resources')
  @ApiOperation({ summary: 'Enregistrer une ressource vérifiable (titre + source + lien)' })
  async addResource(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(resourceSchema))
    body: { subjectId?: string; kind: string; title: string; url: string; source: string; description?: string },
  ) {
    return this.prisma.resourceFavorite.create({
      data: {
        userId: user.id,
        subjectId: body.subjectId ?? null,
        kind: body.kind,
        title: body.title,
        url: body.url,
        source: body.source,
        description: body.description ?? null,
        verifiedAt: new Date(),
      },
    });
  }

  @Delete('resources/:id')
  @ApiOperation({ summary: 'Retirer une ressource des favoris' })
  async removeResource(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.prisma.resourceFavorite.deleteMany({ where: { id, userId: user.id } });
    return { success: true };
  }
}

function buildGreeting(now: Date, _email: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Africa/Douala' }).format(now),
  );
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
