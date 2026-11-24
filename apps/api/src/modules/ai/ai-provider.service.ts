import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

export type AiMode = 'live' | 'demo';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Force une sortie JSON valide (utilisée pour les schémas structurés). */
  json?: boolean;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  mode: AiMode;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/**
 * Couche d'abstraction des fournisseurs de modèles de langage.
 *
 * Exigences (§6) :
 *  - les clés restent côté serveur, jamais dans le Web ni l'Android ;
 *  - changer de fournisseur ne demande aucune modification des fonctionnalités ;
 *  - un mode `demo` (sans modèle distant) est toujours disponible et
 *    explicitement signalé à l'utilisateur ;
 *  - en cas d'erreur/quotas, l'appelant reçoit une exception typée et peut
 *    basculer sur le moteur local sans perte de données.
 *
 * Fournisseurs implémentés : OpenAI (et compatibles type OpenRouter/Ollama via
 * base URL), Google Gemini, Anthropic. Chacun suit le même contrat.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get configuredProvider(): string {
    return this.config.get('AI_PROVIDER', { infer: true });
  }

  /** Mode effectif : `live` seulement si un fournisseur est réellement prêt. */
  get mode(): AiMode {
    if (this.config.get('AI_DEMO_MODE', { infer: true })) return 'demo';
    return this.isProviderReady() ? 'live' : 'demo';
  }

  get model(): string {
    switch (this.configuredProvider) {
      case 'openai':
      case 'openrouter':
        return this.config.get('OPENAI_MODEL', { infer: true });
      case 'google':
        return this.config.get('GOOGLE_MODEL', { infer: true });
      case 'anthropic':
        return this.config.get('ANTHROPIC_MODEL', { infer: true });
      case 'ollama':
        return 'llama3.1:8b';
      default:
        return 'memo-local-engine';
    }
  }

  isProviderReady(): boolean {
    switch (this.configuredProvider) {
      case 'openai':
        return Boolean(this.config.get('OPENAI_API_KEY', { infer: true }));
      case 'openrouter':
        return Boolean(this.config.get('OPENROUTER_API_KEY', { infer: true }));
      case 'google':
        return Boolean(this.config.get('GOOGLE_API_KEY', { infer: true }));
      case 'anthropic':
        return Boolean(this.config.get('ANTHROPIC_API_KEY', { infer: true }));
      case 'ollama':
        return Boolean(this.config.get('OLLAMA_BASE_URL', { infer: true }));
      default:
        return false;
    }
  }

  /**
   * Envoie une conversation. Lève une `AiUnavailableError` si le fournisseur
   * n'est pas configuré ou échoue : l'appelant décide alors du repli.
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const startedAt = Date.now();
    if (!this.isProviderReady()) {
      throw new AiUnavailableError(
        `Aucun fournisseur d'IA configuré (AI_PROVIDER=${this.configuredProvider}). Mode démonstration requis.`,
        'NO_PROVIDER',
      );
    }

    const provider = this.configuredProvider;
    try {
      const result =
        provider === 'google'
          ? await this.callGoogle(messages, options)
          : provider === 'anthropic'
            ? await this.callAnthropic(messages, options)
            : await this.callOpenAiCompatible(messages, options);

      return {
        text: result.text,
        provider,
        model: result.model,
        mode: 'live',
        promptTokens: result.promptTokens,
        outputTokens: result.outputTokens,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Fournisseur ${provider} en échec : ${message}`);
      throw new AiUnavailableError(message, 'PROVIDER_ERROR');
    }
  }

  private async callOpenAiCompatible(messages: ChatMessage[], options: ChatOptions) {
    const isOpenRouter = this.configuredProvider === 'openrouter';
    const apiKey = isOpenRouter
      ? this.config.get('OPENROUTER_API_KEY', { infer: true })
      : this.config.get('OPENAI_API_KEY', { infer: true });
    const baseUrl = isOpenRouter
      ? 'https://openrouter.ai/api/v1'
      : (this.config.get('OPENAI_BASE_URL', { infer: true }) ?? 'https://api.openai.com/v1');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 2000,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${body.slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: payload.choices[0]?.message.content ?? '',
      model: this.model,
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  }

  private async callGoogle(messages: ChatMessage[], options: ChatOptions) {
    const apiKey = this.config.get('GOOGLE_API_KEY', { infer: true });
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxTokens ?? 2000,
            ...(options.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
      },
    );
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      text: payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
      model: this.model,
      promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  private async callAnthropic(messages: ChatMessage[], options: ChatOptions) {
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 2000,
        temperature: options.temperature ?? 0.2,
        ...(system ? { system } : {}),
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
    if (!response.ok) throw new Error(`Anthropic HTTP ${response.status}`);
    const payload = (await response.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: payload.content.map((c) => c.text ?? '').join(''),
      model: this.model,
      promptTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
    };
  }
}

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_PROVIDER' | 'PROVIDER_ERROR' | 'QUOTA' | 'INVALID_OUTPUT',
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
