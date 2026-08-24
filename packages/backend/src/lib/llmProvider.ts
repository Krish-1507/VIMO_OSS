import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import axios from 'axios';
import { asNonStreamingModel } from './nonStreamingModel';
import { ConnectorRegistry } from './connectorRegistry';
import * as credentialStore from './credentialStore';
import { callLLMWithFallback } from './llmErrorHandler';
import { db } from '../db';

import { eq } from 'drizzle-orm';
import { appSettings, connectors } from '../db/schema';
import type { ModelRouteResult } from './modelRouter';
import { createLogger } from './logger';

const log = createLogger('llm');

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20251022',
  google: 'gemini-3-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'openai/gpt-4o-mini', // OpenRouter OpenAI-compat route
  mistral: 'mistral-large-latest',
  ollama: 'llama3',
  custom: 'custom-model',
  pollinations: 'openai', // Pollinations OpenAI-compatible model
};

export function resolveModelName(provider: string, config: Record<string, unknown> | undefined): string {
  const configured = config && (config.modelName as string | undefined);
  if (configured && String(configured).trim().length > 0) {
    return String(configured).trim();
  }
  return DEFAULT_MODELS[provider] || 'gpt-4o';
}

/**
 * The zero-key "it just works" provider: Pollinations' anonymous tier.
 *
 * Its OpenAI-compatible endpoint rejects SSE streaming (`"stream": true` →
 * HTTP 500) while plain completions succeed, so the model is wrapped with
 * asNonStreamingModel() — callers keep using streamText() transparently.
 */
export function createBuiltInFreeProvider(): { provider: any; modelId: string } {
  const openai = createOpenAI({ apiKey: 'pollinations', baseURL: 'https://text.pollinations.ai/openai' });
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: { chat: (id: string) => asNonStreamingModel(openai.chat(id)) },
    modelId: 'openai',
  };
}

/**
 * Read a raw app_settings value (single key), or null when unset.
 */
async function getSetting(key: string): Promise<string | null> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

/**
 * Local-only AI mode ("Never send content to cloud AI").
 *
 * When enabled, only local Ollama connectors may be used for generation and
 * embeddings, and the built-in Pollinations.ai fallback (a cloud service) is
 * disabled entirely.
 */
export async function isLocalOnlyMode(): Promise<boolean> {
  return (await getSetting('ai_privacy_local_only')) === 'true';
}

/**
 * Desired embedding provider, from Settings → AI. Empty means "first active
 * LLM provider" (the historical behavior).
 */
export async function getEmbeddingProviderPreference(): Promise<string> {
  return (await getSetting('embedding_provider'))?.trim() || '';
}

function buildProviderInstance(providerName: string, apiKey: string, config: Record<string, unknown>) {
  switch (providerName) {
    case 'openai':
      return createOpenAI({ apiKey });
    case 'anthropic':
      return createAnthropic({ apiKey }) as unknown;
    case 'google':
      return createGoogleGenerativeAI({ apiKey }) as unknown;
    case 'groq':
      return createOpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
    case 'openrouter':
      // OpenRouter OpenAI-compatible API base
      return createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
    case 'mistral':
      return createOpenAI({ apiKey, baseURL: 'https://api.mistral.ai/v1' });
    case 'ollama': {
      const baseUrl = (config.baseUrl as string) || 'http://localhost:11434';
      return createOpenAI({ apiKey: 'ollama', baseURL: `${baseUrl}/v1` });
    }
    case 'custom': {
      const customBaseUrl = (config.baseUrl as string) || '';
      return createOpenAI({ apiKey, baseURL: customBaseUrl });
    }
    case 'pollinations': {
      // Anonymous Pollinations rejects SSE ("stream":true" -> HTTP 500), so the
      // model is wrapped to stream from a regular completion instead.
      return { chat: (id: string) => asNonStreamingModel(createOpenAI({ apiKey: 'pollinations', baseURL: 'https://text.pollinations.ai/openai' }).chat(id)) };
    }
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActiveLLMProvider(task?: string): Promise<{ provider: any; modelId: string }> {
  const registry = new ConnectorRegistry(db);
  let allConnectors = await registry.getAll();

  // Local-only mode: never touch cloud providers.
  if (await isLocalOnlyMode()) {
    allConnectors = allConnectors.filter((c) => c.provider === 'ollama');
  }

  let llmConnector;
  if (task) {
    const taskKey = `model_${task.toLowerCase().replace(/\s+/g, '_')}`;
    const taskSetting = await db.select().from(appSettings).where(eq(appSettings.key, taskKey)).get();
    if (taskSetting?.value) {
      llmConnector = allConnectors.find((c) => c.id === taskSetting.value && c.type === 'llm' && c.status === 'active');
    }
  }

  if (!llmConnector) {
    // Fallback to first active LLM
    llmConnector = allConnectors.find((c) => c.type === 'llm' && c.status === 'active');
  }

  if (!llmConnector) {
    if (await isLocalOnlyMode()) {
      throw new Error(
        'Local-only AI mode is on, but no local Ollama model is connected. Open Connector Hub, add your Ollama server, and mark it active.',
      );
    }
    // Built-in fallback: use Pollinations.ai (free, no API key needed)
    log.info('No active LLM provider — falling back to built-in Pollinations.ai (free, no key required)');
    return createBuiltInFreeProvider();
  }

  const apiKey = (await credentialStore.getCredential(llmConnector.id, 'apiKey')) || '';
  const config = await registry.getConfig(llmConnector.id);
  const modelId = resolveModelName(llmConnector.provider, config);
  const provider = buildProviderInstance(llmConnector.provider, apiKey, config);

  return { provider, modelId };
}

/**
 * Returns all active LLM providers sorted by assignment priority:
 * 1. Task-specific assignment (if task provided)
 * 2. Any other active LLM connectors
 */
export async function getAllActiveLLMProviders(
  task?: string
): Promise<Array<{ provider: any; modelId: string; connectorId: string; name: string }>> {
  const registry = new ConnectorRegistry(db);
  let allConnectors = await registry.getAll();

  // Local-only mode: never touch cloud providers.
  if (await isLocalOnlyMode()) {
    allConnectors = allConnectors.filter((c) => c.provider === 'ollama');
  }

  let prioritized: Array<{ connector: typeof allConnectors[0]; isTaskSpecific: boolean }> = [];

  // Find task-specific connector first
  if (task) {
    const taskKey = `model_${task.toLowerCase().replace(/\s+/g, '_')}`;
    const taskSetting = await db.select().from(appSettings).where(eq(appSettings.key, taskKey)).get();
    if (taskSetting?.value) {
      const taskConnector = allConnectors.find(
        (c) => c.id === taskSetting.value && c.type === 'llm' && c.status === 'active'
      );
      if (taskConnector) {
        prioritized.push({ connector: taskConnector, isTaskSpecific: true });
      }
    }
  }

  // Add all other active LLM connectors (excluding the task-specific one already added)
  const addedIds = new Set(prioritized.map((p) => p.connector.id));
  for (const c of allConnectors) {
    if (c.type === 'llm' && c.status === 'active' && !addedIds.has(c.id)) {
      prioritized.push({ connector: c, isTaskSpecific: false });
    }
  }

  // Build provider instances
  const results: Array<{ provider: any; modelId: string; connectorId: string; name: string }> = [];
  for (const { connector } of prioritized) {
    try {
      const apiKey = (await credentialStore.getCredential(connector.id, 'apiKey')) || '';
      const config = await registry.getConfig(connector.id);
      const modelId = resolveModelName(connector.provider, config);
      const provider = buildProviderInstance(connector.provider, apiKey, config);
      results.push({ provider, modelId, connectorId: connector.id, name: connector.name });
    } catch (err) {
      log.warn('Failed to build provider instance', { name: connector.name, err: (err as Error).message });
    }
  }

  return results;
}

/**
 * Calls an LLM function with automatic fallback chaining across all active providers.
 * Tries each provider in priority order (task-specific first, then others).
 * Only uses the template fallback when ALL providers have been exhausted.
 *
 * If `modelRoute` is provided, uses ONLY that specific connector/model for the call.
 * If that specific connector fails, falls through to the normal provider chain.
 */
export async function callWithProviderChain<T>(
  task: string,
  fn: (provider: any, modelId: string) => Promise<T>,
  templateFallback?: () => T,
  modelRoute?: ModelRouteResult,
): Promise<T> {
  // If a specific model assignment is provided, try it first
  if (modelRoute) {
    try {
      const localOnly = await isLocalOnlyMode();
      const connRow = await db.select().from(connectors).where(eq(connectors.id, modelRoute.connectorId)).get();
      if (
        connRow &&
        connRow.type === 'llm' &&
        connRow.status === 'active' &&
        (!localOnly || connRow.provider === 'ollama')
      ) {
        const apiKey = (await credentialStore.getCredential(connRow.id, 'apiKey')) || '';
        const config = JSON.parse(connRow.configJson || '{}');
        const provider = buildProviderInstance(connRow.provider, apiKey, config);
        return await callLLMWithFallback(
          async () => fn(provider, modelRoute.modelId),
          () => { throw new Error(`Assigned model "${connRow.name}" failed for "${task}"`); },
          `${connRow.name} (${task})`
        );
      }
  } catch (err) {
    log.warn('Assigned model failed, falling back to provider chain', {
      provider: modelRoute.provider,
      model: modelRoute.modelId,
      task,
      err: (err as Error).message,
    });
  }
  }

  const providers = await getAllActiveLLMProviders(task);

  if (providers.length === 0) {
    // Local-only mode has no built-in fallback: the user explicitly asked for
    // nothing to leave this machine, and Pollinations.ai is a cloud service.
    if (await isLocalOnlyMode()) {
      if (templateFallback) return templateFallback();
      throw new Error(
        'Local-only AI mode is on, but no local Ollama model is connected. Open Connector Hub, add your Ollama server, and mark it active.',
      );
    }
    // Built-in fallback: use Pollinations.ai (free, no API key needed)
    log.info('No active providers for chain — falling back to built-in Pollinations.ai');
    try {
      const { provider: fallbackProvider } = createBuiltInFreeProvider();
      return await callLLMWithFallback(
        async () => fn(fallbackProvider, 'openai'),
        () => { throw new Error('Built-in Pollinations.ai failed'); },
        'pollinations (built-in free)'
      );
    } catch {
      // If built-in also fails, use template fallback
      if (templateFallback) return templateFallback();
      throw new Error('No active LLM provider configured. The built-in free provider also failed. Please go to Connector Hub and add an API key.');
    }
  }

  let lastError: Error | null = null;

  const isAiSdkV1SpecMismatch = (err: unknown): boolean => {
    const msg = (err as Error | undefined)?.message || String(err || '');
    return msg.includes('specification version "v1"') || msg.includes("specification version 'v1'") || msg.toLowerCase().includes('specification version');
  };

  // Special-case: assistant classification should never silently degrade to the template
  // when the provider/model is incompatible with the AI SDK. If we detect the common
  // "specification version v1" mismatch, retry with OpenRouter (OpenAI-compatible)
  // using a known-compatible model.
  const maybeRetryWithOpenRouter = async (): Promise<T | null> => {
    if (task !== 'assistant_classification') return null;
    if (await isLocalOnlyMode()) return null;

    try {
      const openrouterModelId = DEFAULT_MODELS.openrouter;

      // Find an active OpenRouter connector and its API key.
      const registry = new ConnectorRegistry(db);
      const allConnectors = await registry.getAll();
      const openrouterConnector =
        allConnectors.find((c) => c.type === 'llm' && c.status === 'active' && c.provider === 'openrouter') || null;

      if (!openrouterConnector) return null;

      const apiKey = (await credentialStore.getCredential(openrouterConnector.id, 'apiKey')) || '';
      if (!apiKey) return null;

      // OpenRouter is OpenAI-compatible; use the OpenAI-compatible client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const routerProvider = createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' }) as any;

      return fn(routerProvider, openrouterModelId);
    } catch {
      return null;
    }
  };

  for (const { provider, modelId, name } of providers) {
    try {
      // Use callLLMWithFallback for retry logic per provider, but throw
      // so the chain can try the next provider instead of using template fallback
      return await callLLMWithFallback(
        async () => fn(provider, modelId),
        () => { throw new Error(`Provider "${name}" exhausted retries for "${task}"`); },
        `${name} (${task})`
      );
    } catch (err) {
      lastError = err as Error;

      if (isAiSdkV1SpecMismatch(err)) {
        const forced = await maybeRetryWithOpenRouter();
        if (forced !== null) return forced;
      }

      log.warn('Provider failed, trying next', { name, task });
    }
  }

  // All providers failed — try built-in Pollinations.ai as last resort.
  // Skipped entirely in local-only mode.
  if (!(await isLocalOnlyMode())) {
    log.info('All providers failed — falling back to built-in Pollinations.ai');
    try {
      const { provider: fallbackProvider } = createBuiltInFreeProvider();
      return await callLLMWithFallback(
        async () => fn(fallbackProvider, 'openai'),
        () => { throw new Error('Built-in Pollinations.ai also failed'); },
        'pollinations (built-in free)'
      );
    } catch {
      // Pollinations also failed — use template fallback as last resort
      log.error('All providers AND built-in Pollinations.ai failed — using template fallback', {
        task,
        err: lastError?.message,
      });
    }
  } else {
    log.error('All local providers failed — using template fallback', {
      task,
      err: lastError?.message,
    });
  }

  if (templateFallback) return templateFallback();
  throw new Error(
    `All providers failed for task "${task}".` +
      ((await isLocalOnlyMode())
        ? ' Local-only AI mode is on; make sure your Ollama server is reachable.'
        : ' Including the built-in free Pollinations.ai fallback.'),
  );
}

/**
 * Generates an embedding vector for a piece of text using the active LLM
 * provider.
 *
 * - Ollama uses its native /api/embeddings endpoint (it has no
 *   OpenAI-compatible embeddings route).
 * - Every other provider uses the OpenAI-compatible /v1/embeddings endpoint.
 *
 * Falls back to the active LLM connector, then the built-in Pollinations.ai.
 */
export async function embedText(
  input: string,
  modelOverride?: string
): Promise<{ embedding: number[]; model: string; provider: string }> {
  const registry = new ConnectorRegistry(db);
  let allConnectors = await registry.getAll();
  const localOnly = await isLocalOnlyMode();
  const preference = await getEmbeddingProviderPreference();

  if (!input || !input.trim()) {
    throw new Error('embedText requires a non-empty input string');
  }

  // Privacy mode and/or an explicit "use Ollama for embeddings" setting both
  // restrict embeddings to a local Ollama server.
  const wantOllama = localOnly || preference === 'ollama';
  if (wantOllama) {
    const ollamaConnector = allConnectors.find(
      (c) => c.type === 'llm' && c.status === 'active' && c.provider === 'ollama'
    );
    if (!ollamaConnector) {
      throw new Error(
        'Embeddings are set to run on your local Ollama server, but none is connected. Open Connector Hub, add your Ollama server, and mark it active.',
      );
    }
    const apiKey = (await credentialStore.getCredential(ollamaConnector.id, 'apiKey')) || '';
    const config = await registry.getConfig(ollamaConnector.id);
    const modelId = modelOverride || resolveModelName('ollama', config);
    const baseUrl = (config.baseUrl as string) || 'http://localhost:11434';
    const res = await axios.post(`${baseUrl}/api/embeddings`, {
      model: modelId,
      prompt: input,
    });
    const embedding = res.data?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('Ollama returned no embedding for the input.');
    }
    return { embedding: embedding as number[], model: modelId, provider: 'ollama' };
  }

  if (localOnly) {
    // Covered by the branch above; keep the guard explicit for safety.
    throw new Error('Local-only AI mode is on, but no local Ollama model is connected.');
  }

  // Default path: first active LLM connector, falling back to built-in
  // Pollinations.ai when none is configured.
  const llmConnector = allConnectors.find((c) => c.type === 'llm' && c.status === 'active');

  const providerName = llmConnector?.provider || 'pollinations';
  const apiKey = llmConnector ? (await credentialStore.getCredential(llmConnector.id, 'apiKey')) || '' : 'pollinations';
  const config = llmConnector ? await registry.getConfig(llmConnector.id) : {};
  const modelId = modelOverride || resolveModelName(providerName, config);

  // Ollama native embeddings endpoint
  if (providerName === 'ollama') {
    const baseUrl = (config.baseUrl as string) || 'http://localhost:11434';
    const res = await axios.post(`${baseUrl}/api/embeddings`, {
      model: modelId,
      prompt: input,
    });
    const embedding = res.data?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('Ollama returned no embedding for the input.');
    }
    return { embedding: embedding as number[], model: modelId, provider: providerName };
  }

  // OpenAI-compatible embeddings endpoint
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    mistral: 'https://api.mistral.ai/v1',
    pollinations: 'https://text.pollinations.ai/openai',
    custom: (config.baseUrl as string) || '',
  };
  const baseUrl = baseUrls[providerName] || 'https://api.openai.com/v1';
  if (!apiKey) {
    throw new Error(`No API key available for embedding provider "${providerName}".`);
  }

  const res = await axios.post(
    `${baseUrl}/embeddings`,
    { model: modelId, input },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  const embedding = res.data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding provider returned no embedding for the input.');
  }
  return { embedding: embedding as number[], model: modelId, provider: providerName };
}
