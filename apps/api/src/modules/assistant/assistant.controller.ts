import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { assistantMessageSchema } from '@memo/shared';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { RetrievalService } from '../ai/retrieval.service';

const TUTOR_PROMPT = `Tu es MÉMO, tuteur académique francophone de MÉMO CAMPUS.
Tu aides un étudiant à comprendre, mémoriser et progresser.

Méthode imposée :
1. Appuie-toi d'abord sur les extraits de cours fournis ; cite-les par leur numéro [1], [2]…
2. Si l'information ne figure pas dans les extraits, dis-le explicitement
   (« Ce point ne figure pas dans vos cours importés ») et signale clairement
   que la suite provient de connaissances générales.
3. Ne donne pas immédiatement la solution d'un exercice : pose des questions,
   fais formuler l'étudiant, propose un indice progressif.
4. Explique avec des mots simples, puis introduis le vocabulaire technique.
5. Termine par une action concrète et courte (une question de rappel actif,
   un exercice, une révision à programmer).
6. Reste concis (300 mots maximum sauf demande explicite).
7. Jamais de contenu inventé, jamais de fausse référence de page.`;

const PROFESSOR_PROMPT = `${TUTOR_PROMPT}

MODE PROFESSEUR : tu poses UNE SEULE question à la fois, tu attends la réponse,
tu évalues le raisonnement avec bienveillance, tu donnes un indice si l'étudiant
bloque, puis tu adaptes la difficulté. Tu ne donnes la correction complète qu'après
deux tentatives réelles.`;

@ApiTags('Assistant IA')
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly ai: AiProviderService,
    private readonly retrieval: RetrievalService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lister ses conversations' })
  conversations(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: { id: true, title: true, mode: true, updatedAt: true, _count: { select: { messages: true } } },
    });
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Historique d’une conversation' })
  async conversation(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId: user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation introuvable.' });
    }
    return conversation;
  }

  /**
   * Question à l'assistant.
   *
   * - RAG : seuls les passages des cours de l'étudiant sont récupérés ;
   * - chaque citation renvoie au document, au chapitre et à la page ;
   * - sans fournisseur configuré, une réponse locale honnête est produite :
   *   elle extrait et restitue les passages pertinents, sans simuler un modèle.
   */
  @Post('ask')
  @ApiOperation({ summary: 'Poser une question (RAG sur ses propres cours)' })
  async ask(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(assistantMessageSchema))
    body: { conversationId?: string; message: string; subjectId?: string; documentIds: string[]; mode: 'TUTEUR' | 'PROFESSEUR' | 'EXAMEN_BLANC' },
  ) {
    const decision = await this.quota.enforce(user.id, user.planCode, 'assistant_messages_per_day');

    let conversation = body.conversationId
      ? await this.prisma.conversation.findFirst({ where: { id: body.conversationId, userId: user.id } })
      : null;

    if (body.conversationId && !conversation) {
      throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation introuvable.' });
    }

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          userId: user.id,
          subjectId: body.subjectId ?? null,
          mode: body.mode,
          title: body.message.slice(0, 80),
        },
      });
    }

    const retrieved = await this.retrieval.search({
      userId: user.id,
      query: body.message,
      documentIds: body.documentIds,
      subjectId: body.subjectId,
      limit: 6,
    });
    const { prompt: context, citations } = this.retrieval.buildContext(retrieved);
    const corpusEmpty = !(await this.retrieval.hasCorpus(user.id));

    await this.prisma.conversationMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: body.message },
    });

    let answer: string;
    let mode: 'live' | 'demo' = 'demo';
    let usedCitations = citations;

    if (this.ai.mode === 'live') {
      try {
        const history = await this.prisma.conversationMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { role: true, content: true },
        });
        const result = await this.ai.chat(
          [
            { role: 'system', content: body.mode === 'PROFESSEUR' ? PROFESSOR_PROMPT : TUTOR_PROMPT },
            {
              role: 'user',
              content: `${context ? `EXTRAITS DE COURS :\n${context}` : "AUCUN EXTRAIT DISPONIBLE : l'étudiant n'a pas de cours importé correspondant."}

HISTORIQUE RÉCENT :
${history.reverse().map((m) => `${m.role === 'user' ? 'Étudiant' : 'MÉMO'} : ${m.content}`).join('\n')}

QUESTION DE L'ÉTUDIANT : ${body.message}`,
            },
          ],
          { temperature: 0.3, maxTokens: 1200 },
        );
        answer = result.text.trim();
        mode = 'live';
      } catch {
        answer = this.demoAnswer(body.message, citations, corpusEmpty);
      }
    } else {
      answer = this.demoAnswer(body.message, citations, corpusEmpty);
    }

    const assistantMessage = await this.prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: answer,
        mode,
        citations: citations.map((c, index) => ({
          index: index + 1,
          documentId: c.documentId,
          documentTitle: c.documentTitle,
          chapterTitle: c.chapterTitle,
          page: c.page,
          extract: c.content.slice(0, 400),
        })),
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title || body.message.slice(0, 80) },
    });

    return {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      answer,
      mode,
      citations: usedCitations.map((c, index) => ({
        index: index + 1,
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        chapterTitle: c.chapterTitle,
        page: c.page,
        extract: c.content.slice(0, 400),
      })),
      quota: { remaining: decision.remaining, limit: decision.limit },
      disclaimer:
        mode === 'demo'
          ? 'Mode démonstration : réponse construite uniquement à partir des passages de vos cours, sans modèle distant. Vérifiez toujours la source citée.'
          : 'Réponse générée par IA à partir de vos cours. Citez la source avant de l’apprendre.',
    };
  }

  /**
   * Réponse du mode démonstration : extractive, honnête, utile.
   * Elle ne prétend jamais « comprendre » : elle restitue les passages les plus
   * proches, indique les pages, et propose une méthode de travail.
   */
  private demoAnswer(
    question: string,
    citations: { documentTitle: string; chapterTitle: string | null; page: number | null; content: string }[],
    corpusEmpty: boolean,
  ): string {
    if (corpusEmpty) {
      return [
        "Je n’ai encore aucun cours analysé à consulter pour répondre à cette question.",
        '',
        'Importez un cours (PDF, photo ou Word) depuis la bibliothèque : mon analyse s’appuiera alors uniquement sur vos documents, avec les pages sources.',
        '',
        '**Mode démonstration** : aucun modèle de langage distant n’est connecté pour le moment. Je ne génère donc pas de réponse inventée.',
      ].join('\n');
    }

    if (citations.length === 0) {
      return [
        "Je ne trouve pas de passage de vos cours en lien direct avec cette question.",
        '',
        'Deux possibilités : la notion n’a pas encore été importée, ou elle est formulée différemment dans vos documents.',
        '',
        'Essayez avec un terme clé du cours, ou importez le chapitre concerné. Je refuse de répondre sans source : une réponse non vérifiée serait pire qu’une absence de réponse.',
        '',
        '**Mode démonstration** : réponse extractive, sans modèle distant.',
      ].join('\n');
    }

    const top = citations.slice(0, 3);
    const lines: string[] = [
      'Voici ce que vos cours contiennent de plus proche de votre question :',
      '',
    ];
    top.forEach((citation, index) => {
      const location = [citation.documentTitle, citation.chapterTitle, citation.page ? `page ${citation.page}` : null]
        .filter(Boolean)
        .join(' • ');
      const extract = citation.content.replace(/\s+/g, ' ').slice(0, 420);
      lines.push(`**[${index + 1}] ${location}**`);
      lines.push(`> ${extract}${citation.content.length > 420 ? '…' : ''}`);
      lines.push('');
    });

    lines.push(
      `**Pour vérifier votre compréhension** : reformulez ce passage sans le regarder, puis comparez. ${
        question.length < 120 ? 'Où ce passage répond-il précisément à votre question ?' : 'Quelle phrase répond le plus directement à votre question ?'
      }`,
    );
    lines.push('');
    lines.push(
      `**Mode démonstration** : ces passages sont extraits de vos documents (aucune reformulation par un modèle distant). Pour une explication personnalisée, un fournisseur d’IA doit être configuré — voir la documentation d’installation.`,
    );
    return lines.join('\n');
  }
}
