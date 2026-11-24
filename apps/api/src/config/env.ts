import { z } from 'zod';

/**
 * Validation stricte des variables d'environnement au démarrage.
 * Choix assumé : l'application refuse de démarrer en production si un secret
 * essentiel est absent — mieux vaut un échec bruyant qu'un trou de sécurité.
 */
const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(v)));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(10),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_SECRET: z.string().min(24, 'JWT_SECRET doit contenir au moins 24 caractères'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./var/storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('eu-central-1'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(200).default(25),
  AI_PROVIDER: z.enum(['demo', 'openai', 'google', 'anthropic', 'openrouter', 'ollama']).default('demo'),
  AI_DEMO_MODE: bool(true),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL: z.string().default('gemini-2.0-flash'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-haiku-latest'),
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default('http://127.0.0.1:11434'),
  EMBEDDINGS_DIM: z.coerce.number().int().min(64).max(3072).default(768),
  EMBEDDINGS_PROVIDER: z.enum(['local', 'openai']).default('local'),
  /** Clés de paiement — laisser vide désactive proprement l'intégration. */
  CAMPY_API_KEY: z.string().optional(),
  CAMPY_SITE_ID: z.string().optional(),
  CAMPY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Active l'envoi réel d'e-mails (sinon : écriture dans les logs). */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('MÉMO CAMPUS <no-reply@memo-campus.cm>'),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().default(120),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }
  return parsed.data;
}
