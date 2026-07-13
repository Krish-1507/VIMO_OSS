/**
 * Image Generation Service
 *
 * Built-in: Pollinations.ai (free, no API key required).
 * Also supports configured media_generation connectors for paid providers.
 */

import { db } from '../db';
import { eq } from 'drizzle-orm';
import { connectors } from '../db/schema';

const POLLINATIONS_IMAGE_URL = 'https://image.pollinations.ai/prompt';

export interface ImageGenerationResult {
  url: string;
  provider: string;
  model: string;
}

export interface ImageGenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
  connectorId?: string;
  apiKey?: string;
}

async function callProvider(provider: string, apiKey: string, config: Record<string, unknown>, prompt: string, width: number, height: number): Promise<string> {
  switch (provider) {
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: (config.modelName as string) || 'dall-e-3', prompt, n: 1, size: `${width}x${height}` }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error?.message || `OpenAI error: ${res.status}`);
      if (!data.data?.[0]?.url) throw new Error('OpenAI returned no image URL');
      return data.data[0].url;
    }

    case 'stability': {
      const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/ultra', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        body: new URLSearchParams({ prompt, aspect_ratio: `${width}:${height}` }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || `Stability error: ${res.status}`);
      return data.image || data.artifacts?.[0]?.base64 || '';
    }

    case 'cloudflare': {
      const accountId = (config.accountId as string) || '';
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.errors?.[0]?.message || `Cloudflare error: ${res.status}`);
      return `data:image/png;base64,${data.result.image}`;
    }

    case 'replicate': {
      const res = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
        body: JSON.stringify({
          version: (config.modelVersion as string) || 'black-forest-labs/flux-schnell',
          input: { prompt },
        }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.detail || `Replicate error: ${res.status}`);
      const urls = data.output || [];
      if (urls.length === 0) throw new Error('Replicate returned no outputs');
      return urls[0];
    }

    default:
      throw new Error(`Unknown image provider: ${provider}`);
  }
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const { prompt, width = 1024, height = 1024, model = 'flux', seed, connectorId } = params;

  if (connectorId) {
    try {
      const conn = await db.select().from(connectors).where(eq(connectors.id, connectorId)).get();
      if (conn && conn.type === 'media_generation' && conn.status === 'active') {
        const config = JSON.parse(conn.configJson || '{}');
        const provider = conn.provider;
        const apiKey = config.apiKey || '';
        if (apiKey) {
          const url = await callProvider(provider, apiKey, config, prompt, width, height);
          return { url, provider, model: (config.modelName as string) || provider };
        }
      }
    } catch (err) {
      console.warn('[ImageGen] Connector failed, falling back to built-in:', (err as Error).message);
    }
  }

  const encodedPrompt = encodeURIComponent(prompt);
  let url = `${POLLINATIONS_IMAGE_URL}/${encodedPrompt}?width=${width}&height=${height}&model=${model}`;
  if (seed !== undefined) url += `&seed=${seed}`;

  return { url, provider: 'pollinations', model };
}

export async function generateImages(params: ImageGenerationParams & { count: number }): Promise<ImageGenerationResult[]> {
  const results: ImageGenerationResult[] = [];
  for (let i = 0; i < params.count; i++) {
    const seed = params.seed ?? Math.floor(Math.random() * 1000000);
    results.push(await generateImage({ ...params, seed: seed + i }));
  }
  return results;
}
