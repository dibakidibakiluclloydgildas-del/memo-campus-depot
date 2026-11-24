/**
 * Préparation des tests d'intégration.
 *
 * Ces tests parlent à une **vraie** base PostgreSQL (pgvector) et à une **vraie**
 * application NestJS instanciée en mémoire : aucun mock de Prisma. Si la base
 * n'est pas disponible, la suite échoue explicitement plutôt que de faire
 * croire à un succès.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env.test'), quiet: true });
config({ path: resolve(__dirname, '../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL?.replace('/memo_campus?', '/memo_campus_test?') ??
  'postgresql://postgres:postgres@127.0.0.1:5432/memo_campus_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test_secret_de_plus_de_24_caracteres_pour_ci';
// Isoler les tests du service Redis du poste de travail : sans cela, les
// workers BullMQ du test et ceux d'une instance API déjà lancée se
// disputeraient les mêmes jobs (un test ne verrait jamais son document traité).
process.env.REDIS_URL = 'redis://127.0.0.1:6390';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = resolve(__dirname, '../var/test-storage');
process.env.AI_PROVIDER = 'demo';
process.env.AI_DEMO_MODE = 'true';
process.env.EMBEDDINGS_PROVIDER = 'local';
process.env.THROTTLE_LIMIT = '10000';
