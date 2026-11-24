import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { LearningModule } from './modules/learning/learning.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { PlanningModule } from './modules/planning/planning.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ContentModule } from './modules/content/content.module';
import { HealthController } from './modules/health/health.controller';
import { AiProviderService } from './modules/ai/ai-provider.service';
import { AuthGuard } from './common/guards/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: ['.env.local', '.env'] }),
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: Number(process.env.THROTTLE_TTL_SECONDS ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    QueueModule,
    StorageModule,
    AuthModule,
    DocumentsModule,
    SubjectsModule,
    LearningModule,
    AssessmentModule,
    PlanningModule,
    AssistantModule,
    BillingModule,
    AdminModule,
    DashboardModule,
    ContentModule,
  ],
  controllers: [HealthController],
  providers: [
    AiProviderService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((req: { id?: string; headers: Record<string, unknown> }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
        req.id = randomUUID();
        res.setHeader('X-Request-Id', req.id);
        next();
      })
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
