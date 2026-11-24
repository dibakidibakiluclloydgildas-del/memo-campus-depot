import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import type { Env } from '../config/env';

export type QueueName = 'documents' | 'ai' | 'notifications';

export interface QueueJobPayloads {
  documents: { documentId: string; userId: string; forceOcr?: boolean };
  ai: { kind: 'summary' | 'flashcards' | 'assessment' | 'assistant'; userId: string; payload: Record<string, unknown> };
  notifications: { userId: string; kind: string; title: string; body: string; data?: Record<string, unknown> };
}

/**
 * Couche files d'attente (BullMQ/Redis).
 *
 * Dégradation contrôlée : si Redis est indisponible, l'API continue de servir
 * les requêtes synchrones et les traitements lourds sont exécutés en interne
 * (`inline: true`), avec la même garantie de résultat. Aucun job n'est perdu
 * silencieusement : le document reste marqué QUEUED et relançable.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: Redis | null = null;
  private readonly queues = new Map<QueueName, Queue>();
  private available = false;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get('REDIS_URL', { infer: true });
    try {
      this.connection = new IORedis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: true,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
      });
      this.connection.on('error', (error) => {
        if (this.available) this.logger.warn(`Redis : ${error.message}`);
      });
      await this.connection.connect();
      await this.connection.ping();
      this.available = true;
      for (const name of ['documents', 'ai', 'notifications'] as QueueName[]) {
        this.queues.set(
          name,
          new Queue(name, {
            connection: this.connection,
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5_000 },
              removeOnComplete: { age: 86_400, count: 500 },
              removeOnFail: { age: 604_800 },
            },
          }),
        );
      }
      this.logger.log('Files BullMQ connectées à Redis');
    } catch (error) {
      this.available = false;
      this.logger.warn(
        `Redis indisponible (${(error as Error).message}) — traitement des documents en mode synchrone.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.queues.values()) await queue.close();
    if (this.connection) await this.connection.quit().catch(() => undefined);
  }

  isAvailable(): boolean {
    return this.available;
  }

  async ping(): Promise<boolean> {
    if (!this.available || !this.connection) return false;
    try {
      return (await this.connection.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** Ajoute un job ; renvoie `null` si Redis est indisponible (l'appelant décide). */
  async enqueue<N extends QueueName>(
    name: N,
    jobName: string,
    payload: QueueJobPayloads[N],
    options?: JobsOptions,
  ): Promise<Job<QueueJobPayloads[N]> | null> {
    const queue = this.queues.get(name);
    if (!queue || !this.available) return null;
    try {
      return await queue.add(jobName, payload, options);
    } catch (error) {
      this.logger.error(`Échec d'ajout de job ${name}/${jobName} : ${(error as Error).message}`);
      return null;
    }
  }

  /** Enregistre un worker de traitement ; sans Redis, aucun worker n'est créé. */
  registerWorker<N extends QueueName>(
    name: N,
    processor: (job: Job<QueueJobPayloads[N]>) => Promise<void>,
    concurrency = 2,
  ): Worker<QueueJobPayloads[N]> | null {
    if (!this.available || !this.connection) return null;
    const worker = new Worker<QueueJobPayloads[N]>(name, processor, {
      connection: this.connection.duplicate(),
      concurrency,
    });
    worker.on('failed', (job, error) => {
      this.logger.error(`Job ${name}/${job?.name ?? '?'} échoué : ${error.message}`);
    });
    worker.on('error', (error) => this.logger.error(`Worker ${name} : ${error.message}`));
    return worker;
  }
}
