import { io } from '../index';

type RetryableError = {
  retryable: boolean;
  category: 'rate_limit' | 'auth_error' | 'model_error' | 'network' | 'unknown';
};

function classifyError(err: unknown): RetryableError {
  const msg = (err as Error)?.message?.toLowerCase() || '';
  const status = (err as any)?.status || (err as any)?.statusCode || 0;

  if (status === 429 || msg.includes('rate limit') || msg.includes('429')) {
    return { retryable: true, category: 'rate_limit' };
  }
  if (status === 401 || msg.includes('invalid api key') || msg.includes('401') || msg.includes('unauthorized')) {
    return { retryable: false, category: 'auth_error' };
  }
  if (status === 404 || msg.includes('model not found') || msg.includes('does not exist')) {
    return { retryable: false, category: 'model_error' };
  }
  if (msg.includes('econnrefused') || msg.includes('network') || msg.includes('fetch failed') || msg.includes('timeout')) {
    return { retryable: true, category: 'network' };
  }
  return { retryable: true, category: 'unknown' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls a primary LLM function with automatic retry and fallback.
 * - Rate limit (429): waits 10s and retries once
 * - Auth error (401): emits socket event, throws user-friendly error
 * - Model error (404): emits socket event, throws user-friendly error
 * - Network error: retries once after 3s
 * - All other errors after retry: calls fallback function
 */
export async function callLLMWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => T,
  context: string
): Promise<T> {
  try {
    return await primaryFn();
  } catch (err) {
    const classified = classifyError(err);
    console.warn(`[LLM] ${context} failed (${classified.category}):`, (err as Error).message);

    // Rate limit — wait 10s and retry once
    if (classified.category === 'rate_limit') {
      console.log(`[LLM] ${context}: Rate limited. Retrying in 10s...`);
      await sleep(10000);
      try {
        return await primaryFn();
      } catch (retryErr) {
        console.error(`[LLM] ${context}: Retry after rate limit also failed:`, (retryErr as Error).message);
        return fallbackFn();
      }
    }

    // Auth error — emit event, throw
    if (classified.category === 'auth_error') {
      try {
        io.emit('llm:auth_error', { context, error: (err as Error).message });
      } catch { /* io may not be ready */ }
      throw new Error(`LLM authentication failed. Please check your API key in Connector Hub.`);
    }

    // Model error — emit event, throw
    if (classified.category === 'model_error') {
      try {
        io.emit('llm:model_error', { context, error: (err as Error).message });
      } catch { /* io may not be ready */ }
      throw new Error(`LLM model not found. Please check your model configuration in Connector Hub.`);
    }

    // Network error — retry once after 3s
    if (classified.category === 'network') {
      console.log(`[LLM] ${context}: Network error. Retrying in 3s...`);
      await sleep(3000);
      try {
        return await primaryFn();
      } catch (retryErr) {
        console.error(`[LLM] ${context}: Retry after network error also failed:`, (retryErr as Error).message);
        return fallbackFn();
      }
    }

    // Unknown error after first attempt — use fallback
    return fallbackFn();
  }
}
