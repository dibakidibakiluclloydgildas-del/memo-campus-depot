import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { PedagogyService } from '../ai/pedagogy.service';

const summaryInput = z.object({
  level: z.string().trim().max(60).optional(),
  regenerate: z.boolean().default(false),
  save: z.boolean().default(true),
});

const flashcardsInput = z.object({
  count: z.coerce.number().int().min(1).max(40).default(12),
  subjectId: z.string().uuid().optional(),
  save: z.boolean().default(true),
});

const writtenInput = z.object({
  count: z.coerce.number().int().min(1).max(10).default(3),
});

/**
 * Productions pédagogiques rattachées à un cours : résumé structuré, fiches,
 * cartes mémoire, questions ouvertes. Chaque production indique son mode
 * (`live` ou `demo`) et ses sources — jamais de contenu présenté comme certain
 * sans référence au document.
 */
@ApiTags('Contenus pédagogiques')
@Controller('documents/:documentId')
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedagogy: PedagogyService,
    private readonly quota: QuotaService,
  ) {}

  @Post('summary')
  @ApiOperation({ summary: 'Générer (ou régénérer) le résumé structuré du cours' })
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(new ZodValidationPipe(summaryInput)) body: { level?: string; regenerate: boolean; save: boolean },
  ) {
    if (!body.regenerate) {
      const existing = await this.prisma.summary.findFirst({
        where: { userId: user.id, documentId },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return {
          id: existing.id,
          payload: existing.payload,
          mode: existing.mode,
          provider: existing.provider,
          createdAt: existing.createdAt,
          cached: true,
          warnings: [],
        };
      }
    }

    await this.quota.enforce(user.id, user.planCode, 'ai_generations_per_month');
    const result = await this.pedagogy.generateSummary({
      userId: user.id,
      documentId,
      level: body.level,
      save: body.save,
    });
    return { ...result, payload: result.payload, cached: false };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Consulter le dernier résumé enregistré' })
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    const summary = await this.prisma.summary.findFirst({
      where: { userId: user.id, documentId },
      orderBy: { createdAt: 'desc' },
    });
    if (!summary) {
      throw new NotFoundException({
        code: 'NO_SUMMARY',
        message: "Aucun résumé n'a encore été généré pour ce cours.",
      });
    }
    return { id: summary.id, payload: summary.payload, mode: summary.mode, createdAt: summary.createdAt, cached: true };
  }

  @Post('flashcards')
  @ApiOperation({ summary: 'Générer des cartes mémoire (rappel actif) pour ce cours' })
  async flashcards(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(new ZodValidationPipe(flashcardsInput)) body: { count: number; subjectId?: string; save: boolean },
  ) {
    await this.quota.enforce(user.id, user.planCode, 'ai_generations_per_month');
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId: user.id },
      select: { subjectId: true },
    });
    return this.pedagogy.generateFlashcards({
      userId: user.id,
      documentId,
      count: body.count,
      subjectId: body.subjectId ?? document?.subjectId ?? null,
      save: body.save,
    });
  }

  @Get('flashcards')
  @ApiOperation({ summary: 'Cartes mémoire déjà générées pour ce cours' })
  flashcardsList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Query('due') due?: string,
  ) {
    return this.prisma.flashcard.findMany({
      where: {
        userId: user.id,
        documentId,
        ...(due === 'true' ? { dueAt: { lte: new Date() } } : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true, question: true, answer: true, hint: true, dueAt: true,
        masteryScore: true, masteryStatus: true, sourceRef: true,
      },
    });
  }

  /** Fiche de révision consolidée : résumé + notions + formules, imprimable. */
  @Get('revision-sheet')
  @ApiOperation({ summary: 'Fiche de révision imprimable (résumé + notions + formules)' })
  async revisionSheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    const [document, summary, cards] = await Promise.all([
      this.prisma.document.findFirst({
        where: { id: documentId, userId: user.id },
        select: { id: true, title: true, pageCount: true, subject: { select: { name: true } } },
      }),
      this.prisma.summary.findFirst({ where: { userId: user.id, documentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.flashcard.findMany({
        where: { userId: user.id, documentId },
        take: 30,
        select: { question: true, answer: true, masteryStatus: true },
      }),
    ]);
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable.' });
    }
    if (!summary) {
      throw new BadRequestException({
        code: 'SUMMARY_REQUIRED',
        message: "Générez d'abord le résumé du cours pour obtenir une fiche de révision.",
      });
    }
    const payload = summary.payload as {
      objectives?: string[];
      keyNotions?: { term: string; definition: string; source?: { page?: number } }[];
      formulas?: { expression: string; meaning: string }[];
      uncertainties?: string[];
    };
    return {
      title: document.title,
      subject: document.subject?.name ?? null,
      pageCount: document.pageCount,
      generatedAt: summary.createdAt,
      mode: summary.mode,
      objectives: payload.objectives ?? [],
      keyNotions: payload.keyNotions ?? [],
      formulas: payload.formulas ?? [],
      uncertainties: payload.uncertainties ?? [],
      flashcards: cards,
      printHint: 'Utilisez la fonction d’impression du navigateur (Ctrl/Cmd + P) pour obtenir un PDF de cette fiche.',
    };
  }

  @Post('written-questions')
  @ApiOperation({ summary: 'Générer des questions ouvertes avec grille de correction' })
  async written(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(new ZodValidationPipe(writtenInput)) body: { count: number },
  ) {
    const { chunks } = await this.pedagogy.loadDocumentChunks(user.id, documentId);
    const questions = (await import('@memo/shared')).buildLocalWritten(chunks, body.count);
    return {
      questions,
      mode: 'demo',
      note: 'Questions et grilles issues de votre cours (mode démonstration). Modifiez-les librement avant de vous entraîner.',
    };
  }
}
