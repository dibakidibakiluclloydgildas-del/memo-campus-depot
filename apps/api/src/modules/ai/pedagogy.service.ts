import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  assessmentGenerationSchema,
  buildLocalFlashcards,
  buildLocalMcqs,
  buildLocalSummary,
  buildLocalWritten,
  flashcardSchema,
  summarySchema,
  type AssessmentConfigInput,
  type SourceChunk,
} from '@memo/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderService, type ChatMessage } from './ai-provider.service';
import { RetrievalService } from './retrieval.service';

const SUMMARY_SYSTEM_PROMPT = `Tu es un professeur particulier francophone rigoureux et bienveillant.
Tu travailles EXCLUSIVEMENT à partir des extraits de cours fournis par l'étudiant.

Règles absolues :
1. N'INVENTE JAMAIS un contenu absent des extraits. Si une information manque, indique-le dans "uncertainties".
2. Chaque notion clé et chaque chapitre doit pouvoir être rattaché à une page ou une section des extraits.
3. Distingue strictement ce qui vient du cours de tes connaissances complémentaires
   (les compléments vont uniquement dans "complementaryNotes").
4. Adapte le vocabulaire au niveau indiqué, sans vulgariser à l'excès.
5. Réponds en français, dans un JSON strict respectant le schéma demandé, sans texte autour.`;

const ASSESSMENT_SYSTEM_PROMPT = `Tu es un concepteur d'épreuves académiques francophone, exigeant et pédagogue.
Tu génères des évaluations FIDÈLES au cours fourni.

Règles absolues :
1. Chaque question doit être justifiable par un extrait fourni ; renseigne "source" avec la page et une citation courte.
2. Les distracteurs des QCM doivent être plausibles (erreurs typiques d'étudiant), jamais absurdes.
3. Pas de questions ambiguës, pas de doublons, pas de "toutes les réponses ci-dessus".
4. Pour les questions écrites, fournis une grille de correction explicite (critères + points) dont la somme égale "points".
5. Une seule bonne réponse par QCM (correctChoiceIds contient exactement un identifiant).
6. Réponds uniquement en JSON strict respectant le schéma, sans texte autour.`;

@Injectable()
export class PedagogyService {
  private readonly logger = new Logger(PedagogyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
    private readonly retrieval: RetrievalService,
  ) {}

  // ---------------------------------------------------------------------------
  // Chargement des chunks d'un document (owner-scoped)
  // ---------------------------------------------------------------------------

  async loadDocumentChunks(userId: string, documentId: string): Promise<{
    document: { id: string; title: string; pageCount: number | null; status: string };
    chunks: SourceChunk[];
  }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true, title: true, pageCount: true, status: true },
    });
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable dans votre bibliothèque.' });
    }
    if (document.status !== 'READY' && document.status !== 'PARTIAL') {
      throw new BadRequestException({
        code: 'DOCUMENT_NOT_READY',
        message: "L'analyse de ce cours n'est pas terminée. Patientez ou relancez le traitement.",
        details: { status: document.status },
      });
    }

    const rows = await this.prisma.chunk.findMany({
      where: { documentId },
      orderBy: { orderIndex: 'asc' },
      include: { chapter: { select: { id: true, title: true } } },
    });

    return {
      document,
      chunks: rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        chapterId: row.chapterId,
        chapterTitle: row.chapter?.title ?? null,
        page: row.page,
        content: row.content,
      })),
    };
  }

  private formatChunksForPrompt(chunks: SourceChunk[], maxChars = 24_000): string {
    let total = 0;
    const parts: string[] = [];
    for (const chunk of chunks) {
      if (total + chunk.content.length > maxChars) break;
      total += chunk.content.length;
      const header = `[page ${chunk.page ?? '?'}${chunk.chapterTitle ? ` — ${chunk.chapterTitle}` : ''}]`;
      parts.push(`${header}\n${chunk.content}`);
    }
    return parts.join('\n\n---\n\n');
  }

  // ---------------------------------------------------------------------------
  // Résumé
  // ---------------------------------------------------------------------------

  async generateSummary(params: {
    userId: string;
    documentId: string;
    level?: string | null;
    save?: boolean;
  }): Promise<{ payload: unknown; mode: 'live' | 'demo'; provider: string | null; summaryId: string | null; warnings: string[] }> {
    const { document, chunks } = await this.loadDocumentChunks(params.userId, params.documentId);
    if (chunks.length === 0) {
      throw new BadRequestException({
        code: 'NO_EXTRACTED_TEXT',
        message:
          "Aucun texte n'a pu être extrait de ce document. Réimportez-le en meilleure qualité (PDF natif ou photo nette).",
      });
    }

    let payload: unknown;
    let mode: 'live' | 'demo' = 'demo';
    let provider: string | null = null;
    const warnings: string[] = [];

    if (this.ai.mode === 'live') {
      try {
        const messages: ChatMessage[] = [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Niveau de l'étudiant : ${params.level ?? 'universitaire, non précisé'}.
Titre du cours : « ${document.title} ».

EXTRAITS DU COURS :
${this.formatChunksForPrompt(chunks)}

Produis un JSON avec exactement cette structure :
{
  "title": string,
  "generalSummary": string (résumé global en 150-400 mots),
  "objectives": string[] (3 à 8 objectifs pédagogiques formulés à l'infinitif),
  "keyNotions": [{ "term": string, "definition": string, "source": { "page": number, "sectionTitle": string, "fromCourse": true } }],
  "formulas": [{ "expression": string, "meaning": string }],
  "chapters": [{ "title": string, "summary": string, "pageFrom": number, "pageTo": number }],
  "uncertainties": string[],
  "complementaryNotes": string[]
}`,
          },
        ];
        const result = await this.ai.chat(messages, { json: true, temperature: 0.2, maxTokens: 3000 });
        payload = summarySchema.parse(JSON.parse(extractJson(result.text)));
        mode = 'live';
        provider = result.provider;
        await this.recordUsage(params.userId, 'summary', result);
      } catch (error) {
        warnings.push(
          `Le modèle distant n'a pas répondu correctement (${(error as Error).message}). Un résumé extractif local a été produit à la place.`,
        );
      }
    } else {
      warnings.push(
        "Résumé produit en mode démonstration : strictement extractif (phrases du cours), sans modèle distant.",
      );
    }

    if (!payload) {
      payload = buildLocalSummary(chunks, { title: document.title, level: params.level ?? undefined });
    }

    let summaryId: string | null = null;
    if (params.save !== false) {
      const record = await this.prisma.summary.create({
        data: {
          userId: params.userId,
          documentId: params.documentId,
          title: (payload as { title?: string }).title ?? document.title,
          mode,
          provider,
          model: this.ai.model,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      summaryId = record.id;
    }

    return { payload, mode, provider, summaryId, warnings };
  }

  // ---------------------------------------------------------------------------
  // Cartes mémoire
  // ---------------------------------------------------------------------------

  async generateFlashcards(params: {
    userId: string;
    documentId: string;
    count?: number;
    subjectId?: string | null;
    save?: boolean;
  }): Promise<{ cards: { id?: string; question: string; answer: string; page?: number | null; hint?: string }[]; mode: 'live' | 'demo'; warnings: string[] }> {
    const count = Math.min(Math.max(params.count ?? 12, 1), 40);
    const { document, chunks } = await this.loadDocumentChunks(params.userId, params.documentId);
    const warnings: string[] = [];
    let cards: { question: string; answer: string; page?: number | null; hint?: string; chapterId?: string | null }[] = [];
    let mode: 'live' | 'demo' = 'demo';

    if (this.ai.mode === 'live') {
      try {
        const result = await this.ai.chat(
          [
            {
              role: 'system',
              content: `${SUMMARY_SYSTEM_PROMPT}\nTu produis des cartes mémoire pour du rappel actif : question courte et précise, réponse autonome et exacte.`,
            },
            {
              role: 'user',
              content: `Cours : « ${document.title} »\n\n${this.formatChunksForPrompt(chunks, 18_000)}\n\nProduis ${count} cartes au format JSON : {"cards":[{"question":string,"answer":string,"hint":string,"source":{"page":number,"fromCourse":true}}]}`,
            },
          ],
          { json: true, temperature: 0.3, maxTokens: 3000 },
        );
        const parsed = JSON.parse(extractJson(result.text)) as { cards?: unknown[] };
        const validated: { question: string; answer: string; hint?: string; page: number | null }[] = [];
        for (const candidate of parsed.cards ?? []) {
          const checked = flashcardSchema.safeParse(candidate);
          if (!checked.success) continue;
          validated.push({
            question: checked.data.question,
            answer: checked.data.answer,
            hint: checked.data.hint,
            page: checked.data.source?.page ?? null,
          });
        }
        if (validated.length > 0) {
          cards = validated;
          mode = 'live';
          await this.recordUsage(params.userId, 'flashcards', result);
        }
      } catch (error) {
        warnings.push(`Génération distante en échec (${(error as Error).message}) : cartes extractives utilisées.`);
      }
    }

    if (cards.length === 0) {
      cards = buildLocalFlashcards(chunks, count).map((card) => ({
        question: card.question,
        answer: card.answer,
        page: card.page ?? null,
        chapterId: card.chapterId ?? null,
      }));
      warnings.push('Cartes produites en mode démonstration à partir des phrases de votre cours.');
    }

    if (params.save !== false) {
      const created = await this.prisma.$transaction(
        cards.map((card) =>
          this.prisma.flashcard.create({
            data: {
              userId: params.userId,
              documentId: params.documentId,
              subjectId: params.subjectId ?? null,
              chapterId: card.chapterId ?? null,
              question: card.question,
              answer: card.answer,
              hint: card.hint ?? null,
              sourceRef: { page: card.page ?? null, documentTitle: document.title, fromCourse: true },
              dueAt: new Date(),
            },
          }),
        ),
      );
      return {
        cards: created.map((c) => ({ id: c.id, question: c.question, answer: c.answer, page: cardPage(c.sourceRef) })),
        mode,
        warnings,
      };
    }

    return { cards, mode, warnings };
  }

  // ---------------------------------------------------------------------------
  // Évaluations
  // ---------------------------------------------------------------------------

  async generateAssessment(params: {
    userId: string;
    config: AssessmentConfigInput;
    mode: 'live' | 'demo';
  }): Promise<{ assessmentId: string; mode: 'live' | 'demo'; questionCount: number; warnings: string[] }> {
    const { config, userId } = params;
    const warnings: string[] = [];

    const documents = config.documentIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: config.documentIds }, userId },
          select: { id: true, title: true, status: true },
        })
      : await this.prisma.document.findMany({
          where: { userId, ...(config.subjectId ? { subjectId: config.subjectId } : {}), status: { in: ['READY', 'PARTIAL'] } },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, title: true, status: true },
        });

    if (documents.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_DOCUMENT',
        message: 'Sélectionnez au moins un cours analysé pour générer une évaluation.',
      });
    }

    const allChunks: SourceChunk[] = [];
    for (const document of documents) {
      const rows = await this.prisma.chunk.findMany({
        where: { documentId: document.id },
        orderBy: { orderIndex: 'asc' },
        take: 60,
        include: { chapter: { select: { id: true, title: true } } },
      });
      for (const row of rows) {
        allChunks.push({
          id: row.id,
          documentId: row.documentId,
          chapterId: row.chapterId,
          chapterTitle: row.chapter?.title ?? null,
          page: row.page,
          content: row.content,
        });
      }
    }

    if (allChunks.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_CONTENT',
        message: "Les cours sélectionnés ne contiennent aucun texte exploitable. Réimportez-les ou choisissez d'autres cours.",
      });
    }

    let questions: unknown[] = [];
    let usedMode: 'live' | 'demo' = 'demo';

    if (this.ai.mode === 'live') {
      try {
        const result = await this.ai.chat(
          [
            { role: 'system', content: ASSESSMENT_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Type d'épreuve : ${config.type}. Difficulté : ${config.difficulty}.
QCM à produire : ${config.mcqCount}. Questions écrites à produire : ${config.writtenCount}.
Titre : « ${config.title} ».

SOURCES :
${this.formatChunksForPrompt(allChunks, 22_000)}

Schéma JSON attendu :
{"title": string, "instructions": string, "questions": [
  {"type":"MCQ","prompt":string,"choices":[{"id":"a","text":string}...],"correctChoiceIds":["a"],"explanation":string,"difficulty":"FACILE|MOYEN|DIFFICILE","cognitiveLevel":"CONNAISSANCE|COMPREHENSION|APPLICATION|ANALYSE|RAISONNEMENT","points":number,"source":{"page":number,"sectionTitle":string,"quote":string,"fromCourse":true}},
  {"type":"WRITTEN","prompt":string,"expectedAnswer":string,"gradingRubric":[{"criterion":string,"points":number}],"keyPoints":[string],"difficulty":"...","cognitiveLevel":"...","points":number,"source":{...}}
]}`,
            },
          ],
          { json: true, temperature: 0.4, maxTokens: 4000 },
        );
        const parsed = assessmentGenerationSchema.parse(JSON.parse(extractJson(result.text)));
        // Contrôle qualité : uniquement les questions validées par le schéma.
        questions = parsed.questions.map((q) => ({ ...q, valid: true }));
        usedMode = 'live';
        await this.recordUsage(userId, 'assessment', result);
        if (parsed.questions.length < config.mcqCount + config.writtenCount) {
          warnings.push(
            `Le modèle a produit ${parsed.questions.length} question(s) validée(s) sur ${config.mcqCount + config.writtenCount} demandée(s). Les questions non conformes ont été écartées plutôt que de risquer une évaluation erronée.`,
          );
        }
      } catch (error) {
        warnings.push(`Génération distante indisponible (${(error as Error).message}) : épreuve générée en mode démonstration.`);
      }
    }

    if (questions.length === 0) {
      // Le mode démonstration respecte exactement le paramétrage demandé :
      // produire 5 QCM quand l'étudiant en demande 2 fausserait la durée et
      // le barème de l'épreuve.
      const mcqs = config.mcqCount > 0 ? buildLocalMcqs(allChunks, config.mcqCount) : [];
      const written = config.writtenCount > 0 ? buildLocalWritten(allChunks, config.writtenCount) : [];
      questions = [...mcqs, ...written].map((q) => ({
        ...q,
        difficulty: config.difficulty,
        valid: true,
      }));
      usedMode = 'demo';
      warnings.push(
        'Épreuve générée en mode démonstration : les questions sont construites à partir des définitions et passages de votre cours, avec référence de page.',
      );
      const requested = config.mcqCount + config.writtenCount;
      if (questions.length < requested) {
        warnings.push(
          `Le cours fourni ne contient assez de notions sûres que pour ${questions.length} question(s) sur les ${requested} demandée(s). Aucune question n’a été inventée pour compléter l’épreuve.`,
        );
      }
    }

    if (questions.length === 0) {
      throw new BadRequestException({
        code: 'GENERATION_EMPTY',
        message:
          "Impossible de créer des questions fiables à partir de ce cours (contenu trop pauvre ou mal structuré). Ajoutez un cours plus complet ou réessayez avec davantage de matière.",
      });
    }

    const maxScore = (questions as { points?: number }[]).reduce((sum, q) => sum + (q.points ?? 1), 0);

    const assessment = await this.prisma.assessment.create({
      data: {
        userId,
        subjectId: config.subjectId ?? null,
        title: config.title,
        type: config.type,
        difficulty: config.difficulty,
        durationMinutes: config.durationMinutes,
        mode: usedMode,
        provider: usedMode === 'live' ? this.ai.configuredProvider : null,
        status: 'READY',
        documentIds: documents.map((d) => d.id),
        maxScore,
        questions: {
          create: (questions as Record<string, unknown>[]).map((question, index) => {
            const type = question.type === 'WRITTEN' ? 'WRITTEN' : 'MCQ';
            return {
              orderIndex: index,
              type,
              prompt: String(question.prompt ?? ''),
              choices: (question.choices ?? []) as Prisma.InputJsonValue,
              correctChoiceIds: (question.correctChoiceIds ?? []) as string[],
              expectedAnswer: (question.expectedAnswer as string | undefined) ?? null,
              gradingRubric: (question.gradingRubric ?? []) as Prisma.InputJsonValue,
              keyPoints: (question.keyPoints ?? []) as string[],
              explanation: (question.explanation as string | undefined) ?? null,
              points: Number(question.points ?? 1),
              difficulty: String(question.difficulty ?? config.difficulty),
              cognitiveLevel: String(question.cognitiveLevel ?? 'CONNAISSANCE'),
              sourceRef: (question.source ?? { fromCourse: true }) as Prisma.InputJsonValue,
            };
          }),
        },
      },
    });

    return {
      assessmentId: assessment.id,
      mode: usedMode,
      questionCount: questions.length,
      warnings,
    };
  }

  /** Journalisation des coûts IA (§15) : une ligne par appel réussi. */
  private async recordUsage(
    userId: string,
    feature: string,
    result: { provider: string; model: string; mode: string; promptTokens: number; outputTokens: number; latencyMs: number },
  ): Promise<void> {
    try {
      await this.prisma.aiUsage.create({
        data: {
          userId,
          feature,
          provider: result.provider,
          model: result.model,
          mode: result.mode,
          promptTokens: result.promptTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          // Estimation prudente (USD cents) pour le suivi de marge.
          costUsdCents: Math.ceil(result.promptTokens * 0.00000015 * 100 + result.outputTokens * 0.0000006 * 100),
          success: true,
        },
      });
    } catch (error) {
      this.logger.warn(`Suivi d'usage IA non enregistré : ${(error as Error).message}`);
    }
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Aucun objet JSON détecté dans la réponse du modèle');
  }
  return trimmed.slice(start, end + 1);
}

function cardPage(ref: Prisma.JsonValue): number | null {
  if (ref && typeof ref === 'object' && !Array.isArray(ref)) {
    const page = (ref as Record<string, unknown>).page;
    return typeof page === 'number' ? page : null;
  }
  return null;
}
