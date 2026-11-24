import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: true,
  });

  app.setGlobalPrefix('api');
  app.set('trust proxy', 1);

  // Sécurité HTTP : en-têtes stricts, CSP adaptée à Swagger UI.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser());

  const origins = (process.env.CORS_ORIGINS ?? `${process.env.APP_URL ?? 'http://localhost:3000'},http://localhost:3000,http://localhost:8081`)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Applications mobiles natives : pas d'en-tête Origin.
      if (!origin || origins.includes(origin) || /^https?:\/\/[a-z0-9-]+\.e2b\.app$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origine non autorisée'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 86_400,
  });

  // La validation d'entrée est assurée par des schémas Zod partagés avec le
  // Web et l'Android (ZodValidationPipe). Pas de double validation DTO.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MÉMO CAMPUS — API')
    .setDescription(
      "API REST de la plateforme EdTech MÉMO CAMPUS : authentification, import et analyse de cours, moteur pédagogique (RAG), évaluations et corrections, planning, assistant, abonnements et administration.\n\nAuthentification : jeton JWT renvoyé par /api/auth/login (Bearer) ou cookie httpOnly.",
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addTag('Authentification')
    .addTag('Cours et documents')
    .addTag('Évaluations')
    .addTag('Révisions')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    customSiteTitle: 'MÉMO CAMPUS API',
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`API MÉMO CAMPUS à l'écoute sur http://0.0.0.0:${port}/api`);
  logger.log(`Documentation OpenAPI : http://0.0.0.0:${port}/api/docs`);
}

void bootstrap();
