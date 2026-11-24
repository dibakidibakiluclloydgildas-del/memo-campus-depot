import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assessmentConfigSchema,
  buildReport,
  summarizeReport,
  type GeneratedQuestion,
  type AssessmentReport,
} from '@memo/shared';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import type { Prisma } from '@prisma/client';
import { PedagogyService } from '../ai/pedagogy.service';

@ApiTags('Évaluations')
@Controller('assessments')
export class AssessmentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedagogy: PedagogyService,
    private readonly quota: QuotaService,
  ) {}

  @Post('generate')
  @ApiOperation({ summary: 'Générer une épreuve (QCM, écrite ou mixte) à partir de ses cours' })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(assessmentConfigSchema)) config: Parameters<typeof assessmentConfigSchema.parse>[0],
  ) {
    await this.quota.enforce(user.id, user.planCode, 'assessments_per_month');
    await this.quota.enforce(user.id, user.planCode, 'ai_generations_per_month');
    const result = await this.pedagogy.generateAssessment({
      userId: user.id,
      config: config as never,
      mode: 'demo',
    });
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'Historique des évaluations' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    const items = await this.prisma.assessment.findMany({
      where: { userId: user.id, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, title: true, type: true, difficulty: true, status: true, mode: true,
        maxScore: true, score: true, percentage: true, durationMinutes: true,
        createdAt: true, submittedAt: true,
        subject: { select: { name: true, color: true } },
        _count: { select: { questions: true } },
      },
    });
    return items;
  }

  /**
   * Sujet de l'épreuve. En mode examen, les bonnes réponses et explications
   * ne sont **jamais** envoyées au client avant la soumission.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Sujet d’une évaluation (sans corrigé avant soumission)' })
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, userId: user.id },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!assessment) {
      throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND', message: 'Évaluation introuvable.' });
    }

    const showAnswers = assessment.status === 'SUBMITTED' || assessment.status === 'GRADED';

    return {
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      difficulty: assessment.difficulty,
      durationMinutes: assessment.durationMinutes,
      status: assessment.status,
      mode: assessment.mode,
      maxScore: assessment.maxScore,
      score: assessment.score,
      percentage: assessment.percentage,
      startedAt: assessment.startedAt,
      submittedAt: assessment.submittedAt,
      questions: assessment.questions.map((question) => ({
        id: question.id,
        orderIndex: question.orderIndex,
        type: question.type,
        prompt: question.prompt,
        choices: question.choices,
        points: question.points,
        difficulty: question.difficulty,
        cognitiveLevel: question.cognitiveLevel,
        sourceRef: question.sourceRef,
        ...(showAnswers
          ? {
              correctChoiceIds: question.correctChoiceIds,
              expectedAnswer: question.expectedAnswer,
              gradingRubric: question.gradingRubric,
              explanation: question.explanation,
              answer: question.answer,
              awarded: question.awarded,
              feedback: question.feedback,
              needsHumanReview: question.needsHumanReview,
            }
          : {}),
      })),
      report: assessment.report,
    };
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Démarrer l’épreuve (chronomètre serveur)' })
  async start(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const assessment = await this.prisma.assessment.findFirst({ where: { id, userId: user.id } });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND', message: 'Évaluation introuvable.' });
    if (assessment.status === 'SUBMITTED' || assessment.status === 'GRADED') {
      throw new BadRequestException({ code: 'ALREADY_SUBMITTED', message: 'Cette évaluation est déjà terminée.' });
    }
    const updated = await this.prisma.assessment.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startedAt: assessment.startedAt ?? new Date() },
    });
    const endsAt = updated.startedAt
      ? new Date(updated.startedAt.getTime() + updated.durationMinutes * 60_000)
      : null;
    return { startedAt: updated.startedAt, endsAt, durationMinutes: updated.durationMinutes };
  }

  /**
   * Soumission et correction.
   * - QCM : corrigés de façon déterministe (aucune IA) ;
   * - questions écrites : grille de critères explicite, points partiels,
   *   réponses équivalentes acceptées, signalement pour revue si nécessaire.
   */
  @Post(':id/submit')
  @ApiOperation({ summary: 'Soumettre les réponses et obtenir la correction détaillée' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { answers?: { questionId: string; type: 'MCQ' | 'WRITTEN'; selectedChoiceIds?: string[]; text?: string }[]; autoSubmitted?: boolean },
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, userId: user.id },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND', message: 'Évaluation introuvable.' });
    if (assessment.status === 'SUBMITTED' || assessment.status === 'GRADED') {
      throw new ForbiddenException({ code: 'ALREADY_SUBMITTED', message: 'Cette évaluation a déjà été soumise.' });
    }

    const answers = body.answers ?? [];
    const validIds = new Set(assessment.questions.map((q) => q.id));
    for (const answer of answers) {
      if (!validIds.has(answer.questionId)) {
        throw new BadRequestException({
          code: 'INVALID_QUESTION',
          message: 'Une réponse fait référence à une question qui n’appartient pas à cette épreuve.',
        });
      }
    }

    const generated: GeneratedQuestion[] = assessment.questions.map((question) => {
      const base = {
        id: question.id,
        prompt: question.prompt,
        points: question.points,
        difficulty: question.difficulty as 'FACILE' | 'MOYEN' | 'DIFFICILE',
        cognitiveLevel: question.cognitiveLevel as 'CONNAISSANCE',
        source: (question.sourceRef ?? { fromCourse: true }) as { fromCourse: boolean },
      };
      if (question.type === 'MCQ') {
        return {
          ...base,
          type: 'MCQ' as const,
          choices: (question.choices ?? []) as { id: string; text: string }[],
          correctChoiceIds: question.correctChoiceIds,
          explanation: question.explanation ?? '',
        } as GeneratedQuestion;
      }
      return {
        ...base,
        type: 'WRITTEN' as const,
        expectedAnswer: question.expectedAnswer ?? '',
        gradingRubric: (question.gradingRubric ?? []) as { criterion: string; points: number }[],
        keyPoints: question.keyPoints,
        points: question.points,
      } as GeneratedQuestion;
    });

    // Le barème réel provient de la base ; toute réponse manquante vaut 0.
    const report: AssessmentReport = buildReport(
      generated,
      assessment.questions.map((question) => {
        const answer = answers.find((a) => a.questionId === question.id);
        return {
          questionId: question.id,
          type: question.type as 'MCQ' | 'WRITTEN',
          selectedChoiceIds: answer?.selectedChoiceIds ?? [],
          text: answer?.text ?? '',
        };
      }),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const correction of report.corrections) {
        await tx.assessmentQuestion.update({
          where: { id: correction.questionId },
          data: {
            awarded: correction.awarded,
            needsHumanReview: correction.type === 'WRITTEN' ? correction.needsHumanReview : false,
            feedback: correction.type === 'WRITTEN' ? correction.feedback : correction.explanation,
            answer: {
              selectedChoiceIds: correction.type === 'MCQ' ? correction.selectedChoiceIds : [],
              text: answers.find((a) => a.questionId === correction.questionId)?.text ?? null,
            },
          },
        });
      }
      await tx.assessment.update({
        where: { id },
        data: {
          status: 'GRADED',
          submittedAt: new Date(),
          autoSubmitted: body.autoSubmitted ?? false,
          score: report.score,
          percentage: report.percentage,
          report: {
            ...summarizeReport(report),
            corrections: report.corrections,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return {
      id,
      score: report.score,
      maxScore: report.maxScore,
      percentage: report.percentage,
      mention: report.mention,
      corrections: report.corrections,
      weakNotions: report.weakNotions,
      recommendations: report.recommendations,
    };
  }

  /** Compte-rendu détaillé avec historique (refaire, revoir, réviser). */
  @Get(':id/report')
  @ApiOperation({ summary: 'Rapport de correction détaillé et recommandations' })
  async report(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, userId: user.id },
      include: { questions: { orderBy: { orderIndex: 'asc' } }, subject: { select: { name: true, color: true } } },
    });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND', message: 'Évaluation introuvable.' });
    if (!assessment.submittedAt) {
      throw new BadRequestException({ code: 'NOT_SUBMITTED', message: 'Cette évaluation n’a pas encore été soumise.' });
    }
    return assessment;
  }
}
