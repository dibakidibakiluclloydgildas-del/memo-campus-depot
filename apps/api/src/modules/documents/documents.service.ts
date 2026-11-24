import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '@memo/shared';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionService } from '../ingestion/extraction.service';
import { StructureService } from '../ingestion/structure.service';
import { EmbeddingsService, toPgVector } from '../ai/embeddings.service';
import { QuotaService } from '../billing/quota.service';
import { QueueService } from '../../queue/queue.service';

interface UploadInput {
  buffer: Buffer;
  originalName: string;
  declaredMime: string;
  title?: string;
  subjectId?: string;
  language?: string;
}

/**
 * Cycle de vie complet d'un cours (§5) :
 * téléversement sécurisé → validation → extraction → OCR → structure →
 * découpage → indexation → statut consultable → visualisation de l'original.
 *
 * Le traitement est idempotent (`reprocess`), reprenable après erreur, et
 * expose une progression réelle (pas simulée) à chaque étape.
 */
@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly extraction: ExtractionService,
    private readonly structure: StructureService,
    private readonly embeddings: EmbeddingsService,
    private readonly quota: QuotaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.maxBytes = Math.min(
      this.config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024,
      MAX_UPLOAD_BYTES * 4,
    );
  }

  onModuleInit(): void {
    // Worker interne : traite les documents volumineux hors du cycle HTTP.
    this.queue.registerWorker(
      'documents',
      async (job) => {
        await this.process(job.data.documentId, job.data.userId);
      },
      2,
    );
  }

  // ---------------------------------------------------------------------------
  // Téléversement
  // ---------------------------------------------------------------------------

  async upload(userId: string, planCode: string, input: UploadInput) {
    if (!input.buffer || input.buffer.byteLength === 0) {
      throw new BadRequestException({ code: 'EMPTY_FILE', message: 'Le fichier reçu est vide.' });
    }
    if (input.buffer.byteLength > this.maxBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `Fichier trop volumineux (maximum ${Math.round(this.maxBytes / (1024 * 1024))} Mo).`,
      });
    }

    const sniffed = this.extraction.sniffMime(input.buffer, input.declaredMime);
    if (!sniffed) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_TYPE',
        message:
          'Format non reconnu. Formats acceptés : PDF, JPG, JPEG, PNG, DOCX. Le contenu réel du fichier est vérifié, pas seulement son extension.',
      });
    }
    if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(sniffed)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_TYPE',
        message: 'Ce type de fichier n’est pas pris en charge.',
      });
    }

    const storageMb = Math.ceil(input.buffer.byteLength / (1024 * 1024));
    // Trois plafonds distincts, tous vérifiés côté serveur avant toute écriture :
    // stock total, volume mensuel d'imports et espace de stockage occupé.
    await this.quota.enforce(userId, planCode, 'documents_total');
    await this.quota.enforce(userId, planCode, 'documents_per_month');
    await this.quota.enforce(userId, planCode, 'storage_mb', storageMb);

    if (input.subjectId) {
      const subject = await this.prisma.subject.findFirst({
        where: { id: input.subjectId, userId },
        select: { id: true },
      });
      if (!subject) {
        throw new ForbiddenException({
          code: 'SUBJECT_NOT_OWNED',
          message: "Cette matière n'appartient pas à votre compte.",
        });
      }
    }

    const extension =
      sniffed === 'application/pdf' ? '.pdf' : sniffed === 'image/png' ? '.png' : sniffed === 'image/jpeg' ? '.jpg' : '.docx';

    const stored = await this.storage.put(userId, input.buffer, extension);
    const title = (input.title?.trim() || input.originalName.replace(/\.[^.]+$/, '')).slice(0, 160);

    const document = await this.prisma.document.create({
      data: {
        userId,
        subjectId: input.subjectId ?? null,
        title,
        originalName: input.originalName.slice(0, 250),
        mimeType: sniffed,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        checksum: stored.checksum,
        status: 'QUEUED',
        statusMessage: 'En attente de traitement…',
        progress: 0,
        language: input.language ?? 'fr',
      },
    });

    const job = await this.queue.enqueue('documents', 'process', { documentId: document.id, userId });
    if (!job) {
      // Pas de Redis : traitement immédiat asynchrone (non bloquant pour la requête).
      void this.process(document.id, userId).catch((error) =>
        this.logger.error(`Traitement immédiat échoué : ${(error as Error).message}`),
      );
    }

    return {
      id: document.id,
      title: document.title,
      status: document.status,
      queued: Boolean(job),
      message: 'Cours reçu. L’analyse démarre ; suivez la progression dans la bibliothèque.',
    };
  }

  // ---------------------------------------------------------------------------
  // Pipeline de traitement
  // ---------------------------------------------------------------------------

  async process(documentId: string, userId: string): Promise<void> {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, userId } });
    if (!document) {
      this.logger.warn(`Traitement demandé pour un document inexistant : ${documentId}`);
      return;
    }

    const update = async (status: string, progress: number, statusMessage: string, extra: Record<string, unknown> = {}) => {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status, progress, statusMessage, ...extra },
      });
    };

    try {
      await update('EXTRACTING', 10, 'Extraction du texte en cours…');
      const buffer = await this.storage.read(document.storageKey);
      const extraction = await this.extraction.extract(buffer, document.mimeType, document.language);

      await update('OCR', 35, 'Reconnaissance du texte terminée', {
        pageCount: extraction.pageCount,
        ocrUsed: extraction.ocrUsed,
      });

      const pagesWithText = extraction.pages.filter((page) => page.text.trim().length > 0);
      if (pagesWithText.length === 0) {
        throw new Error(
          "Aucun texte n'a pu être extrait. Le document est peut-être vierge, protégé ou trop flou pour l'OCR.",
        );
      }

      await this.prisma.documentPage.deleteMany({ where: { documentId } });
      await this.prisma.documentPage.createMany({
        data: extraction.pages.map((page) => ({
          documentId,
          pageNumber: page.pageNumber,
          text: page.text,
          usedOcr: page.usedOcr,
          confidence: page.confidence ?? null,
          charCount: page.text.length,
        })),
      });

      await update('STRUCTURING', 50, 'Détection de la structure…');
      const structured = this.structure.structure(extraction.pages, document.title);

      // Remplacement atomique des chapitres/chunks existants (reprocess sûr).
      await this.prisma.$transaction([
        this.prisma.chunk.deleteMany({ where: { documentId } }),
        this.prisma.chapter.deleteMany({ where: { documentId } }),
      ]);

      const chapters = await Promise.all(
        structured.chapters.map((chapter) =>
          this.prisma.chapter.create({
            data: {
              documentId,
              subjectId: document.subjectId,
              title: chapter.title.slice(0, 200),
              orderIndex: chapter.orderIndex,
              pageFrom: chapter.pageFrom,
              pageTo: chapter.pageTo,
              summary: chapter.body.slice(0, 1500),
            },
          }),
        ),
      );

      await update('CHUNKING', 65, 'Découpage en sections…');
      const chapterIds = chapters.map((chapter) => chapter.id);
      const chunkRows = structured.chunks.map((chunk) => ({
        documentId,
        chapterId: chapterIds[chunk.chapterIndex] ?? null,
        page: chunk.page,
        orderIndex: chunk.orderIndex,
        content: chunk.content,
        tokenCount: Math.ceil(chunk.content.length / 4),
      }));

      await this.prisma.chunk.createMany({ data: chunkRows });

      await update('INDEXING', 80, 'Indexation sémantique…');
      const createdChunks = await this.prisma.chunk.findMany({
        where: { documentId },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, content: true },
      });
      const vectors = await this.embeddings.embedMany(createdChunks.map((chunk) => chunk.content));
      for (const [index, chunk] of createdChunks.entries()) {
        const vector = vectors[index];
        if (!vector) continue;
        await this.prisma.$executeRawUnsafe(
          `UPDATE "Chunk" SET embedding = $1::vector WHERE id = $2::uuid`,
          toPgVector(vector),
          chunk.id,
        );
      }

      const warnings = [...extraction.warnings, ...structured.structureWarnings];
      const isPartial = extraction.pages.some((page) => page.text.trim().length === 0);
      await update(isPartial ? 'PARTIAL' : 'READY', 100, isPartial
        ? 'Analyse terminée avec avertissements : certaines pages sont inexploitables.'
        : 'Analyse terminée : votre cours est prêt.', {
        errorDetails: warnings.length ? { warnings } : undefined,
        processedAt: new Date(),
        ocrPages: extraction.ocrPages,
      });

      await this.prisma.subject
        .findFirst({ where: { id: document.subjectId ?? '' } })
        .catch(() => undefined);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Échec du traitement ${documentId} : ${message}`);
      // Le document peut avoir été supprimé pendant le traitement (suppression
      // de compte, par exemple) : la mise à jour d'échec ne doit pas produire
      // d'erreur non gérée dans le worker.
      await this.prisma.document
        .update({
          where: { id: documentId },
          data: {
            status: 'FAILED',
            progress: 100,
            statusMessage: `Échec : ${message}`,
            errorDetails: { error: message, at: new Date().toISOString() },
          },
        })
        .catch(() => undefined);
    }
  }

  async reprocess(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, userId } });
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable.' });
    }
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'QUEUED', progress: 0, statusMessage: 'Nouvelle analyse demandée…', errorDetails: undefined },
    });
    const job = await this.queue.enqueue('documents', 'reprocess', { documentId, userId, forceOcr: true });
    if (!job) {
      void this.process(documentId, userId).catch(() => undefined);
    }
    return { success: true, queued: Boolean(job) };
  }

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  async list(
    userId: string,
    query: { page?: number; pageSize?: number; search?: string; subjectId?: string; status?: string; archived?: boolean },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where = {
      userId,
      archived: query.archived ?? false,
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { OR: [{ title: { contains: query.search, mode: 'insensitive' as const } }, { originalName: { contains: query.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, title: true, originalName: true, mimeType: true, sizeBytes: true,
          status: true, statusMessage: true, progress: true, pageCount: true, ocrUsed: true,
          createdAt: true, processedAt: true, subjectId: true, archived: true,
          subject: { select: { id: true, name: true, color: true } },
          _count: { select: { chapters: true, chunks: true, summaries: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async detail(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      include: {
        subject: { select: { id: true, name: true, color: true } },
        chapters: { orderBy: { orderIndex: 'asc' }, select: { id: true, title: true, pageFrom: true, pageTo: true, orderIndex: true } },
        summaries: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, title: true, payload: true, mode: true, createdAt: true } },
        pages: { orderBy: { pageNumber: 'asc' }, select: { pageNumber: true, charCount: true, usedOcr: true, confidence: true } },
      },
    });
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable dans votre bibliothèque.' });
    }

    return {
      ...document,
      warnings:
        document.errorDetails && typeof document.errorDetails === 'object'
          ? (document.errorDetails as { warnings?: string[] }).warnings ?? []
          : [],
      fileUrl: this.storage.signedUrl(document.storageKey, userId, 900),
    };
  }

  async remove(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, userId } });
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable.' });
    }
    await this.prisma.document.delete({ where: { id: documentId } });
    await this.storage.remove(document.storageKey);
    return { success: true };
  }

  async archive(userId: string, documentId: string, archived: boolean) {
    const result = await this.prisma.document.updateMany({
      where: { id: documentId, userId },
      data: { archived },
    });
    if (result.count === 0) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable.' });
    }
    return { success: true, archived };
  }

  /** Original consultable à côté de l'analyse (URL signée, expiration 15 min). */
  async getSignedFile(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { storageKey: true, mimeType: true, originalName: true },
    });
    if (!document) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable.' });
    }
    return {
      url: this.storage.signedUrl(document.storageKey, userId, 900),
      mimeType: document.mimeType,
      originalName: document.originalName,
      expiresInSeconds: 900,
    };
  }
}
