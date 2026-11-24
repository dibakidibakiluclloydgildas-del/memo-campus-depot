import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Env } from '../../config/env';

/**
 * Embeddings.
 *
 * Par défaut : **embedding local déterministe** (hashing trick + n-grammes de
 * caractères, normalisé L2). Ce n'est pas un modèle neuronal : c'est une
 * représentation lexicale robuste, gratuite, sans appel réseau, qui permet à la
 * recherche sémantique de fonctionner réellement hors ligne et sans clé API.
 * Elle est clairement identifiée comme telle (mode `local`).
 *
 * Si `EMBEDDINGS_PROVIDER=openai` et une clé sont fournis, on utilise
 * `text-embedding-3-small` (1536 dimensions) ; la dimension est alors contrôlée
 * pour rester compatible avec l'index `vector(768)` via troncature + L2.
 *
 * Le produit n'expose jamais de clé côté navigateur. Le changement de
 * fournisseur n'impose pas de réécrire l'application (couche d'abstraction).
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly dim: number;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.dim = this.config.get('EMBEDDINGS_DIM', { infer: true });
  }

  get provider(): 'local' | 'openai' {
    const provider = this.config.get('EMBEDDINGS_PROVIDER', { infer: true });
    if (provider === 'openai' && !this.config.get('OPENAI_API_KEY', { infer: true })) {
      this.logger.warn('EMBEDDINGS_PROVIDER=openai sans OPENAI_API_KEY → repli sur l’embedding local.');
      return 'local';
    }
    return provider;
  }

  async embed(text: string): Promise<number[]> {
    if (this.provider === 'openai') {
      try {
        return await this.embedOpenAi(text);
      } catch (error) {
        this.logger.warn(`Embedding distant indisponible (${(error as Error).message}) → repli local.`);
      }
    }
    return this.embedLocal(text);
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const batchSize = 64;
    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      if (this.provider === 'openai') {
        try {
          results.push(...(await this.embedOpenAiBatch(slice)));
          continue;
        } catch (error) {
          this.logger.warn(`Lot d'embeddings distant échoué : ${(error as Error).message}`);
        }
      }
      results.push(...slice.map((text) => this.embedLocal(text)));
    }
    return results;
  }

  /**
   * Embedding lexical déterministe : sac de mots + trigrammes de caractères,
   * projeté dans un espace de dimension fixe par hachage signé, puis normalisé.
   * Deux textes proches lexicalement ont une similarité cosinus élevée, ce qui
   * suffit pour un premier niveau de RAG et reste reproductible en test.
   */
  embedLocal(text: string, dim = this.dim): number[] {
    const vector = new Array<number>(dim).fill(0);
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9à-ÿ\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tokens = normalized.split(' ').filter((t) => t.length > 2);
    const features = new Map<string, number>();

    for (const token of tokens) {
      features.set(`w:${token}`, (features.get(`w:${token}`) ?? 0) + 1);
      const padded = `#${token}#`;
      for (let i = 0; i < padded.length - 2; i += 1) {
        const trigram = `t:${padded.slice(i, i + 3)}`;
        features.set(trigram, (features.get(trigram) ?? 0) + 0.5);
      }
    }

    for (const [feature, weight] of features) {
      const digest = createHash('sha256').update(feature).digest();
      const index = digest.readUInt32BE(0) % dim;
      const sign = digest.readUInt8(4) % 2 === 0 ? 1 : -1;
      const value = Math.log(1 + weight) * sign;
      vector[index] = (vector[index] ?? 0) + value;
    }

    return l2Normalize(vector);
  }

  private async embedOpenAi(text: string): Promise<number[]> {
    const [vector] = await this.embedOpenAiBatch([text]);
    if (!vector) throw new Error('Réponse d’embedding vide');
    return vector;
  }

  private async embedOpenAiBatch(texts: string[]): Promise<number[][]> {
    const apiKey = this.config.get('OPENAI_API_KEY', { infer: true });
    const baseUrl = this.config.get('OPENAI_BASE_URL', { infer: true }) ?? 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OpenAI embeddings ${response.status}`);
    const payload = (await response.json()) as { data: { embedding: number[] }[] };
    return payload.data.map((item) => l2Normalize(resize(item.embedding, this.dim)));
  }
}

function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function resize(vector: number[], dim: number): number[] {
  if (vector.length === dim) return vector;
  if (vector.length > dim) return vector.slice(0, dim);
  return [...vector, ...new Array<number>(dim - vector.length).fill(0)];
}

/** Formate un vecteur au format littéral pgvector : '[0.1,0.2,…]'. */
export function toPgVector(vector: number[]): string {
  return `[${vector.map((v) => v.toFixed(6)).join(',')}]`;
}
