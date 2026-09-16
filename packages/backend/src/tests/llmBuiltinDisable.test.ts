/**
 * VIMO_DISABLE_BUILTIN_LLM — the dead free tier must never be attempted.
 *
 * The auto-created `built-in-pollinations` connector row still exists even
 * when the flag is set, so the provider chain has to exclude it explicitly.
 * Otherwise every LLM call burns minutes hanging on a dead endpoint before
 * reaching the instant template fallback — which is exactly what made the
 * Director E2E suite flaky in keyless CI (pipeline time hovered around the
 * 120s poll budget depending on network luck).
 *
 * Real in-memory DB, no network: building provider instances performs no I/O.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getAllActiveLLMProviders, getActiveLLMProvider } from '../lib/llmProvider';

const FLAG = 'VIMO_DISABLE_BUILTIN_LLM';
const saved = process.env[FLAG];

afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

describe('VIMO_DISABLE_BUILTIN_LLM=1', () => {
  it('excludes the built-in pollinations connector from the provider chain', async () => {
    process.env[FLAG] = '1';
    const providers = await getAllActiveLLMProviders('analytics insights');
    expect(providers).toEqual([]);
  });

  it('fails fast instead of attempting the network', async () => {
    process.env[FLAG] = '1';
    await expect(getActiveLLMProvider('analytics insights')).rejects.toThrow(
      /disabled/i,
    );
  });
});
