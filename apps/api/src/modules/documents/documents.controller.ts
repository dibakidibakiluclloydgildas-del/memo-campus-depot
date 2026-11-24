import {
  BadRequestException,
  NotFoundException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { documentMetaSchema } from '@memo/shared';
import { DocumentsService } from './documents.service';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  subjectId: z.string().uuid().optional(),
  status: z.string().max(20).optional(),
  archived: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
});

@ApiTags('Cours et documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        subjectId: { type: 'string' },
        language: { type: 'string', enum: ['fr', 'en'] },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Importer un cours (PDF, JPG, PNG, DOCX) et lancer son analyse' })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    @Body() body: Record<string, string | undefined>,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'NO_FILE', message: 'Aucun fichier reçu. Sélectionnez un cours à importer.' });
    }
    const meta = documentMetaSchema.parse({
      title: body.title,
      subjectId: body.subjectId || undefined,
      language: body.language === 'en' ? 'en' : 'fr',
    });

    return this.documents.upload(user.id, user.planCode, {
      buffer: file.buffer,
      originalName: file.originalname,
      declaredMime: file.mimetype,
      title: meta.title,
      subjectId: meta.subjectId,
      language: meta.language,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Lister sa bibliothèque (pagination, recherche, filtres)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string>) {
    return this.documents.list(user.id, listQuerySchema.parse(query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un cours : chapitres, pages, avertissements, URL signée' })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.documents.detail(user.id, id);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Obtenir une URL signée temporaire vers le fichier original' })
  file(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.documents.getSignedFile(user.id, id);
  }

  @Post(':id/reprocess')
  @ApiOperation({ summary: 'Relancer l’analyse après une erreur' })
  reprocess(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.documents.reprocess(user.id, id);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archiver ou restaurer un cours' })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { archived?: boolean },
  ) {
    return this.documents.archive(user.id, id, body.archived ?? true);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer définitivement un cours et ses fichiers' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.documents.remove(user.id, id);
  }

  /** Pages extraites, pour la vue « cours à côté de l'analyse ». */
  @Get(':id/pages')
  @ApiOperation({ summary: 'Texte extrait page par page (source de vérité des citations)' })
  async pages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: string,
  ) {
    const owned = await this.prisma.document.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!owned) {
      // 404 et non 403 : on ne révèle pas l'existence d'un document tiers.
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Cours introuvable.' });
    }
    const pageNumber = page ? Number.parseInt(page, 10) : undefined;
    const pages = await this.prisma.documentPage.findMany({
      where: { documentId: id, ...(pageNumber ? { pageNumber } : {}) },
      orderBy: { pageNumber: 'asc' },
      take: pageNumber ? 1 : 200,
    });
    return pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      usedOcr: p.usedOcr,
      confidence: p.confidence,
      charCount: p.charCount,
    }));
  }
}

/** Téléchargement via URL signée (aucune session requise, signature obligatoire). */
@ApiTags('Fichiers')
@Controller('files')
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('download')
  @ApiOperation({ summary: 'Télécharger un fichier via URL signée à durée limitée' })
  async download(
    @Query() query: { key?: string; uid?: string; expires?: string; signature?: string },
    @Res() res: Response,
  ): Promise<void> {
    const { key, uid, expires, signature } = query;
    if (!key || !uid || !expires || !signature) {
      res.status(400).json({ code: 'INVALID_SIGNATURE', message: 'Lien de téléchargement incomplet.' });
      return;
    }
    const expiresAt = Number.parseInt(expires, 10);
    if (!this.storage.verifySignedUrl(key, uid, expiresAt, signature)) {
      res.status(403).json({ code: 'LINK_EXPIRED', message: 'Ce lien a expiré. Rechargez la page pour en obtenir un nouveau.' });
      return;
    }

    // Double vérification : le document doit toujours appartenir à l'utilisateur
    // signataire (révocation possible si le compte a changé de propriétaire).
    const document = await this.prisma.document.findFirst({
      where: { storageKey: key, userId: uid },
      select: { originalName: true, mimeType: true },
    });
    if (!document) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Fichier introuvable.' });
      return;
    }

    const buffer = await this.storage.read(key);
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }
}
