import { Module } from '@nestjs/common';
import { DocumentsController, FilesController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ExtractionService } from '../ingestion/extraction.service';
import { StructureService } from '../ingestion/structure.service';
import { EmbeddingsService } from '../ai/embeddings.service';
import { QuotaService } from '../billing/quota.service';

@Module({
  controllers: [DocumentsController, FilesController],
  providers: [DocumentsService, ExtractionService, StructureService, EmbeddingsService, QuotaService],
  exports: [DocumentsService, EmbeddingsService, QuotaService, ExtractionService],
})
export class DocumentsModule {}
