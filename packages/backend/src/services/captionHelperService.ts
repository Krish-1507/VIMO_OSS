/**
 * Caption helper: rewrite and translate captions in the Composer.
 *
 * These are deliberately non-blocking helpers: if no LLM is reachable the
 * original caption is returned unchanged, so the user never loses their work.
 * Both use the shared provider chain, so they respect per-task model
 * assignments, local-only AI mode, and the fallback ordering in llmProvider.
 */

import { generateText } from 'ai';
import { callWithProviderChain } from '../lib/llmProvider';
import { createLogger } from '../lib/logger';

const log = createLogger('caption-helper');

export interface RewriteCaptionParams {
  content: string;
  /** Free-form tone instruction, e.g. "more playful" or "professional". */
  tone: string;
  platform?: string;
  brandProfileId?: string;
}

export interface TranslateCaptionParams {
  content: string;
  targetLanguage: string;
  platform?: string;
}

/** Sanitize the tone input so it can be interpolated into the prompt safely. */
function safeTone(tone: string): string {
  return tone.trim().replace(/[\r\n]+/g, ' ').slice(0, 200) || 'the same';
}

function safeLanguage(lang: string): string {
  return lang.trim().replace(/[\r\n]+/g, ' ').slice(0, 100) || 'English';
}

export async function rewriteCaption(params: RewriteCaptionParams): Promise<string> {
  const { content, platform } = params;
  const tone = safeTone(params.tone);

  const prompt = [
    `Rewrite the following social media caption with a ${tone} tone.`,
    platform ? `Platform: ${platform}.` : 'Platform: unspecified (keep it platform-neutral).',
    'Keep the message and key facts identical. Do not add claims, links, or hashtags',
    'that were not present. Return ONLY the rewritten caption text, no commentary.',
    '',
    content,
  ].join('\n');

  try {
    return await callWithProviderChain(
      'content generation',
      async (provider, modelId) => {
        const { text } = await generateText({ model: provider.chat(modelId), prompt });
        return text.trim();
      },
      // No LLM available: keep the user's text exactly as it was.
      () => content,
    );
  } catch (err) {
    log.warn('rewriteCaption failed; returning original content', {
      err: err instanceof Error ? err.message : String(err),
    });
    return content;
  }
}

export async function translateCaption(params: TranslateCaptionParams): Promise<string> {
  const { content, platform } = params;
  const targetLanguage = safeLanguage(params.targetLanguage);

  const prompt = [
    `Translate the following social media caption into ${targetLanguage}.`,
    platform ? `Platform: ${platform}.` : 'Platform: unspecified (keep it platform-neutral).',
    'Keep the tone and message identical. Do not add claims, links, or hashtags',
    'that were not present. Return ONLY the translated caption text, no commentary.',
    '',
    content,
  ].join('\n');

  try {
    return await callWithProviderChain(
      'content generation',
      async (provider, modelId) => {
        const { text } = await generateText({ model: provider.chat(modelId), prompt });
        return text.trim();
      },
      // No LLM available: keep the user's text exactly as it was.
      () => content,
    );
  } catch (err) {
    log.warn('translateCaption failed; returning original content', {
      err: err instanceof Error ? err.message : String(err),
    });
    return content;
  }
}
