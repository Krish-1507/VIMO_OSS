/**
 * LLM call cache — dedupe repeated LLM calls.
 *
 * The Marketing Director runs four workers (research → analytics → content →
 * engagement) and a final synthesis over the *same* brand context. Several of
 * those steps (and re-runs of the Director for the same brand) can issue
 * byte-identical prompts. Hitting the LLM again for the same input wastes
 * money and latency, so we memoize by (task + prompt + context).
 *
 * The cache is provider-agnostic on purpose: the same prompt asked of any
 * model returns the same cached answer. That is exactly what we want for
 * cost/latency — we don't care *which* model answered the first time.
 *
 * Cache lifetime defaults to 1 hour (TTL) so a brand's morning briefing and an
 * afternoon re-run can share results, while stale data eventually expires.
 */

import { createHash } from 'node:crypto';
import { callWithProviderChain } from './llmProvider';
import { createLogger } from './logger';

const log = createLogger('llm:cache');

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  value: string;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function hashKey(parts: unknown[]): string {
  const h = createHash('sha256');
  for (const p of parts) {
    h.update('\u0000');
    h.update(typeof p === 'string' ? p : JSON.stringify(p));
  }
  return h.digest('hex');
}

export interface CachedLLMOptions {
  /** Extra context that makes a call unique (e.g. { brandId }). Included in the key. */
  context?: Record<string, unknown>;
  /** Override the default TTL (ms). Pass 0 for "never expire within process". */
  ttlMs?: number;
  /** Template fallback used by the provider chain when every model fails. */
  fallback?: () => string;
}

/**
 * Run an LLM text completion through the provider chain, caching the result by
 * (task, prompt, context). Returns the cached text immediately on a hit.
 */
export async function cachedLLMText(
  task: string,
  prompt: string,
  opts: CachedLLMOptions = {},
): Promise<string> {
  const key = hashKey([task, prompt, opts.context ?? {}]);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    log.debug('cache hit', { task, brandId: (opts.context as any)?.brandId, key: key.slice(0, 12) });
    return hit.value;
  }

  const result = await callWithProviderChain(
    task,
    async (provider, modelId) => {
      const { generateText } = await import('ai');
      const { text } = await generateText({ model: provider.chat(modelId), prompt });
      return text;
    },
    opts.fallback,
  );

  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  cache.set(key, { value: result, expires: now + ttl });
  return result;
}

/** Clear the in-memory cache (used by tests and on manual cache reset). */
export function clearLLMCache(): void {
  cache.clear();
}
