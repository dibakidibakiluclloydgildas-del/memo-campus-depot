import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { EmbeddingsService, toPgVector } from './embeddings.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chapterId: string | null;
  chapterTitle: string | null;
  page: number | null;
  content: string;
  score: number;
  source: 'vector' | 'fulltext';
}

/**
 * Recherche documentaire (RAG) sur les cours **de l'étudiant uniquement**.
 *
 * Stratégie en deux temps, sans dépendance à un service externe :
 *  1. recherche vectorielle pgvector (index HNSW, distance cosinus) ;
 *  2. repli/complément en recherche plein texte française (tsvector + websearch)
 *     si l'embedding n'est pas disponible ou si le score est faible.
 *
 * L'isolation est garantie par la clause `WHERE d."userId" = $user`, appliquée
 * dans la requête SQL elle-même — jamais côté client.
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async search(params: {
    userId: string;
    query: string;
    documentIds?: string[];
    subjectId?: string;
    limit?: number;
  }): Promise<RetrievedChunk[]> {
    const limit = Math.min(params.limit ?? 8, 20);
    const documentFilter =
      params.documentIds && params.documentIds.length > 0
        ? `AND d.id = ANY($4::uuid[])`
        : `AND ($4::uuid[] IS NULL)`;

    const vector = await this.embeddings.embed(params.query);
    const vectorLiteral = toPgVector(vector);

    const vectorQuery = `
      SELECT c.id AS "chunkId", c."documentId" AS "documentId", d.title AS "documentTitle",
             c."chapterId" AS "chapterId", ch.title AS "chapterTitle", c.page AS page,
             c.content AS content,
             1 - (c.embedding <=> $1::vector) AS score
      FROM "Chunk" c
      JOIN "Document" d ON d.id = c."documentId"
      LEFT JOIN "Chapter" ch ON ch.id = c."chapterId"
      WHERE d."userId" = $2::uuid
        AND c.embedding IS NOT NULL
        AND d.archived = false
        AND ($3::uuid IS NULL OR d."subjectId" = $3::uuid)
        ${documentFilter}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $5::int
    `;

    let vectorResults: RetrievedChunk[] = [];
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        vectorQuery,
        vectorLiteral,
        params.userId,
        params.subjectId ?? null,
        params.documentIds && params.documentIds.length > 0 ? params.documentIds : null,
        limit,
      )) as RetrievedChunk[];
      vectorResults = rows.map((row) => ({ ...row, source: 'vector' as const }));
    } catch (error) {
      this.logger.warn(`Recherche vectorielle indisponible : ${(error as Error).message}`);
    }

    const bestScore = vectorResults[0]?.score ?? 0;
    if (vectorResults.length >= 3 && bestScore > 0.35) {
      return vectorResults;
    }

    // Complément plein texte : améliore le rappel sur les requêtes courtes.
    const fulltextQuery = `
      SELECT c.id AS "chunkId", c."documentId" AS "documentId", d.title AS "documentTitle",
             c."chapterId" AS "chapterId", ch.title AS "chapterTitle", c.page AS page,
             c.content AS content,
             ts_rank(c.content_tsv, websearch_to_tsquery('french', $1)) AS score
      FROM "Chunk" c
      JOIN "Document" d ON d.id = c."documentId"
      LEFT JOIN "Chapter" ch ON ch.id = c."chapterId"
      WHERE d."userId" = $2::uuid
        AND d.archived = false
        AND ($3::uuid IS NULL OR d."subjectId" = $3::uuid)
        ${documentFilter}
        AND c.content_tsv @@ websearch_to_tsquery('french', $1)
      ORDER BY score DESC
      LIMIT $5::int
    `;

    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        fulltextQuery,
        params.query,
        params.userId,
        params.subjectId ?? null,
        params.documentIds && params.documentIds.length > 0 ? params.documentIds : null,
        limit,
      )) as RetrievedChunk[];
      const merged = [...vectorResults];
      for (const row of rows) {
        const candidate = { ...row, source: 'fulltext' as const };
        const existing = merged.findIndex((m) => m.chunkId === candidate.chunkId);
        if (existing === -1) merged.push(candidate);
      }
      return merged.slice(0, limit);
    } catch (error) {
      this.logger.warn(`Recherche plein texte indisponible : ${(error as Error).message}`);
      return vectorResults;
    }
  }

  /** Contexte formaté pour le prompt, avec références explicites [1], [2]… */
  buildContext(chunks: RetrievedChunk[]): { prompt: string; citations: RetrievedChunk[] } {
    const usable = chunks.filter((chunk) => chunk.content.trim().length > 0).slice(0, 8);
    const prompt = usable
      .map((chunk, index) => {
        const location = [
          `Document : « ${chunk.documentTitle} »`,
          chunk.chapterTitle ? `Section : ${chunk.chapterTitle}` : null,
          chunk.page ? `Page ${chunk.page}` : null,
        ]
          .filter(Boolean)
          .join(' • ');
        return `[${index + 1}] ${location}\n${chunk.content.slice(0, 1800)}`;
      })
      .join('\n\n---\n\n');
    return { prompt, citations: usable };
  }

  /** Indique explicitement si le corpus est vide (évite de halluciner). */
  async hasCorpus(userId: string): Promise<boolean> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT EXISTS (SELECT 1 FROM "Chunk" c JOIN "Document" d ON d.id = c."documentId" WHERE d."userId" = $1::uuid AND d.status = 'READY') AS exists`,
      userId,
    )) as { exists: boolean }[];
    return Boolean(rows[0]?.exists);
  }

  get embeddingDimension(): number {
    return this.config.get('EMBEDDINGS_DIM', { infer: true });
  }
}
