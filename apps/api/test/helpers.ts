import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

/** Démarre l'API complète (mêmes modules que la production). */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
    },
  };
}

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@test.memo-campus.cm`;
}

export const TEST_PASSWORD = 'MotDePasse2026!';

/** Crée un compte étudiant et renvoie son jeton + son profil. */
export async function registerStudent(
  app: INestApplication,
  overrides: Partial<{ email: string; displayName: string; planCode: string }> = {},
): Promise<{ token: string; userId: string; email: string }> {
  const request = (await import('supertest')).default;
  const email = overrides.email ?? uniqueEmail('etudiant');
  const response = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      email,
      password: TEST_PASSWORD,
      displayName: overrides.displayName ?? 'Étudiant Test',
      acceptTerms: true,
      institution: 'Université de Yaoundé I',
    })
    .expect(201);

  const token = response.body.token as string;
  const userId = response.body.user.id as string;

  if (overrides.planCode && overrides.planCode !== 'FREE') {
    const prisma = app.get(PrismaService);
    await prisma.user.update({ where: { id: userId }, data: { planCode: overrides.planCode } });
  }

  return { token, userId, email };
}

/** Garantit la présence des offres (configuration administrable) en base de test. */
export async function ensurePlans(prisma: PrismaService): Promise<void> {
  const plans = [
    {
      code: 'FREE',
      name: 'Découverte',
      quotas: {
        documents_total: 5,
        documents_per_month: 3,
        ai_generations_per_month: 10,
        assessments_per_month: 3,
        assistant_messages_per_day: 10,
        storage_mb: 100,
        ocr_pages_per_month: 20,
      },
    },
    {
      code: 'PREMIUM',
      name: 'Premium',
      quotas: {
        documents_total: -1,
        documents_per_month: 60,
        ai_generations_per_month: 400,
        assessments_per_month: 80,
        assistant_messages_per_day: 200,
        storage_mb: 5000,
        ocr_pages_per_month: 600,
      },
    },
    {
      code: 'INSTITUTION',
      name: 'Institution',
      quotas: {
        documents_total: -1,
        documents_per_month: 2000,
        ai_generations_per_month: 10000,
        assessments_per_month: 5000,
        assistant_messages_per_day: 1000,
        storage_mb: 50000,
        ocr_pages_per_month: 20000,
      },
    },
  ];

  for (const [index, plan] of plans.entries()) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: { ...plan, sortOrder: index, priceXafMonthly: index * 3500, priceXafYearly: index * 35000 },
      update: { quotas: plan.quotas },
    });
  }
}

/** Nettoie les données créées par un test (isolation stricte entre tests). */
export async function cleanupUser(prisma: PrismaService, userId: string): Promise<void> {
  await prisma.user.deleteMany({ where: { id: userId } });
}
