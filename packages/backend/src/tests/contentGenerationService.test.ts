import { describe, it, expect, vi } from 'vitest';
import { generatePost } from '../services/contentGenerationService';

// Mock LLM
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      content: 'This is a test post for Instagram.',
      hashtags: ['test', 'marketing'],
      imageSuggestion: 'A high-tech marketing dashboard'
    })
  })
}));

vi.mock('../lib/llmProvider', () => ({
  getActiveLLMProvider: vi.fn().mockResolvedValue({
    provider: { chat: () => ({}) },
    modelId: 'test-model',
  }),
  callWithProviderChain: vi.fn().mockImplementation(
    async (_taskName: string, fn: (provider: any, modelId: string) => Promise<any>) => {
      return fn({ chat: () => ({}) }, 'test-model');
    }
  ),
}));

vi.mock('../services/brandBrainService', () => ({
  buildBrandContext: vi.fn().mockResolvedValue('Brand Context')
}));

describe('contentGenerationService', () => {
  it('generatePost returns valid structure', async () => {
    const result = await generatePost({
      brandProfileId: 'test-brand',
      platform: 'instagram',
      topic: 'ai marketing'
    });

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('hashtags');
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(result).toHaveProperty('imageSuggestion');
  });

  it('generatePost respects platform limits', async () => {
    const result = await generatePost({
      brandProfileId: 'test-brand',
      platform: 'instagram',
      topic: 'ai marketing'
    });
    expect(result.content.length).toBeLessThan(2200);
  });
});
