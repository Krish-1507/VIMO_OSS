/**
 * Caption helper service — rewrite and translate.
 *
 * Both helpers are non-blocking by design: when no LLM is reachable the
 * original caption comes back unchanged so the user never loses their work.
 * The provider chain is mocked here; the chain itself is tested elsewhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = vi.hoisted(() => ({
  callWithProviderChain: vi.fn(),
}));

vi.mock('../lib/llmProvider', () => chain);

import { rewriteCaption, translateCaption } from '../services/captionHelperService';

beforeEach(() => {
  chain.callWithProviderChain.mockReset();
});

describe('rewriteCaption', () => {
  it('returns the rewritten text from the provider chain', async () => {
    chain.callWithProviderChain.mockImplementation(async () => 'a rewritten caption');

    const result = await rewriteCaption({
      content: 'Hello world!',
      tone: 'more playful',
      platform: 'instagram',
    });

    expect(result).toBe('a rewritten caption');
  });

  it('returns the original content when no provider is available', async () => {
    chain.callWithProviderChain.mockRejectedValue(new Error('no provider'));

    const content = 'Original caption';
    const result = await rewriteCaption({ content, tone: 'professional' });
    expect(result).toBe(content);
  });

  it('keeps the original content when the chain falls back to the template', async () => {
    chain.callWithProviderChain.mockImplementation(
      async (_task: string, _fn: Function, templateFallback: () => string) => templateFallback(),
    );

    const content = 'Keep me';
    const result = await rewriteCaption({ content, tone: 'bold' });
    expect(result).toBe(content);
  });
});

describe('translateCaption', () => {
  it('returns the translated text from the provider chain', async () => {
    chain.callWithProviderChain.mockImplementation(async () => 'a translated caption');

    const result = await translateCaption({
      content: 'Hello!',
      targetLanguage: 'Spanish',
    });

    expect(result).toBe('a translated caption');
  });

  it('returns the original content when the provider chain fails', async () => {
    chain.callWithProviderChain.mockRejectedValue(new Error('chain down'));

    const content = 'Hola';
    const result = await translateCaption({ content, targetLanguage: 'English' });
    expect(result).toBe(content);
  });
});
