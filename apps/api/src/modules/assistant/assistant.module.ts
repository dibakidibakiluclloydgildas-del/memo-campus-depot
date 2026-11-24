import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AiProviderService } from '../ai/ai-provider.service';
import { RetrievalService } from '../ai/retrieval.service';
import { EmbeddingsService } from '../ai/embeddings.service';
import { QuotaService } from '../billing/quota.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [AssistantController],
  providers: [AiProviderService, RetrievalService, EmbeddingsService, QuotaService, PrismaService],
})
export class AssistantModule {}
