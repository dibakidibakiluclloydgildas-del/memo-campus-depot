import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller';
import { PedagogyService } from '../ai/pedagogy.service';
import { RetrievalService } from '../ai/retrieval.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { EmbeddingsService } from '../ai/embeddings.service';
import { QuotaService } from '../billing/quota.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [LearningController],
  providers: [PedagogyService, RetrievalService, AiProviderService, EmbeddingsService, QuotaService, PrismaService],
  exports: [PedagogyService],
})
export class LearningModule {}
