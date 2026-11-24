import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/guards/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { APP_VERSION, type HealthResponse } from '@memo/shared';

@ApiTags('Santé')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly ai: AiProviderService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'État du service, de la base, de Redis et du fournisseur IA' })
  async health(): Promise<HealthResponse> {
    const [dbOk, redisOk] = await Promise.all([this.prisma.ping(), this.queue.ping()]);

    // pgvector est une dépendance fonctionnelle : son absence dégrade le RAG.
    let vectorOk = false;
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ok`,
      )) as { ok: boolean }[];
      vectorOk = Boolean(rows[0]?.ok);
    } catch {
      vectorOk = false;
    }

    const checks = [
      { name: 'postgres', ok: dbOk },
      { name: 'pgvector', ok: vectorOk },
      { name: 'redis', ok: redisOk, detail: redisOk ? undefined : 'Traitements lourds en mode synchrone' },
      { name: 'ai_provider', ok: this.ai.isProviderReady(), detail: `mode=${this.ai.mode}` },
    ];

    const critical = checks.filter((check) => ['postgres', 'pgvector'].includes(check.name));

    return {
      status: critical.every((check) => check.ok) ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      checks,
      ai: { provider: this.ai.configuredProvider, mode: this.ai.mode },
    };
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Point d’entrée de l’API' })
  root() {
    return {
      name: 'MÉMO CAMPUS API',
      version: APP_VERSION,
      documentation: '/api/docs',
      health: '/api/health',
      message: 'Plateforme EdTech — API REST. Toutes les routes métier exigent une session.',
    };
  }
}
