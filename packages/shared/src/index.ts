export * from './enums.js';
export * from './schemas.js';
export * from './logic/spaced-repetition.js';
export * from './logic/grading.js';
export * from './logic/planner.js';
export * from './logic/quota.js';
export * from './logic/local-engine.js';

/** Contrat d'erreur commun à toutes les réponses de l'API. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /** Code machine stable, exploitable par le client. */
  code: string;
  details?: unknown;
  requestId?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  checks: { name: string; ok: boolean; detail?: string }[];
  ai: { provider: string; mode: 'live' | 'demo' };
}

export const APP_NAME = 'MÉMO CAMPUS';
export const APP_VERSION = '0.1.0';
