/**
 * Canva Integration Routes
 * 
 * Enables content generation in Content Studio via Canva API.
 * User prompts -> AI generates content -> Canva designs created -> User edits in Canva -> Download/Schedule
 */

import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { connectors } from '../db/schema';
import * as credentialStore from '../lib/credentialStore';
import { formatError } from '../lib/errorFormatter';
import { generateText } from 'ai';
import { callWithProviderChain } from '../lib/llmProvider';
import { buildCanvaDeepLink, createDesignFromText } from '../connectors/handlers/canvaHandler';
import { createLogger } from '../lib/logger';

const log = createLogger('canva');

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface CanvaDesignRequest {
  topic: string;
  platforms: string[];
  vibe: string;
  brandProfileId?: string;
}

interface CanvaDesign {
  designId: string;
  title: string;
  editUrl: string;
  thumbnailUrl?: string;
  platform: string;
  dimensions: { width: number; height: number };
}

/* ------------------------------------------------------------------ */
/*  Canva API Helpers                                               */
/* ------------------------------------------------------------------ */

async function getCanvaAccessToken(): Promise<string | null> {
  // Find active Canva connector
  const connector = await db
    .select()
    .from(connectors)
    .where(and(
      eq(connectors.provider, 'canva'),
      eq(connectors.status, 'active')
    ))
    .get();

  if (!connector) return null;

  const accessToken = await credentialStore.getCredential(connector.id, 'accessToken');
  return accessToken || null;
}

async function createCanvaDesign(
  accessToken: string,
  title: string,
  designType: string
): Promise<{ designId: string; editUrl: string }> {
  try {
    const response = await axios.post(
      'https://api.canva.com/rest/v1/designs',
      {
        design: {
          design_type: { type: designType },
          title,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const design = response.data?.design;
    return {
      designId: design?.id,
      editUrl: design?.urls?.edit_url || `https://www.canva.com/design/${design?.id}/edit`,
    };
  } catch (error: any) {
    console.error('[Canva] Create design error:', error.response?.data || error.message);
    throw new Error('Failed to create Canva design');
  }
}

function getDesignTypeForPlatform(platform: string): string {
  const platformTypes: Record<string, string> = {
    instagram: 'InstagramPost',
    instagram_story: 'InstagramStory',
    facebook: 'FacebookPost',
    linkedin: 'LinkedInPost',
    twitter: 'TwitterPost',
    pinterest: 'PinterestPin',
    tiktok: 'TikTokVideo',
    youtube: 'YouTubeThumbnail',
  };
  return platformTypes[platform] || 'InstagramPost';
}

function getDimensionsForPlatform(platform: string): { width: number; height: number } {
  const dimensions: Record<string, { width: number; height: number }> = {
    instagram: { width: 1080, height: 1080 },
    instagram_story: { width: 1080, height: 1920 },
    facebook: { width: 1200, height: 630 },
    linkedin: { width: 1200, height: 627 },
    twitter: { width: 1200, height: 675 },
    pinterest: { width: 1000, height: 1500 },
    tiktok: { width: 1080, height: 1920 },
    youtube: { width: 1280, height: 720 },
  };
  return dimensions[platform] || dimensions.instagram;
}

/* ------------------------------------------------------------------ */
/*  AI Content Generation                                             */
/* ------------------------------------------------------------------ */

async function generateDesignContent(
  topic: string,
  platform: string,
  vibe: string,
  brandProfileId?: string
): Promise<{ title: string; description: string; hashtags: string[] }> {
  const prompt = `Create social media content for ${platform} about "${topic}".
Vibe/Style: ${vibe}

Generate:
1. A catchy, scroll-stopping title (max 60 chars)
2. An engaging description (2-3 sentences)
3. 5-7 relevant hashtags

Respond in this exact JSON format:
{
  "title": "...",
  "description": "...",
  "hashtags": ["#...", "#..."]
}`;

  const result = await callWithProviderChain(
    'content generation',
    async (provider, modelId) => {
      const { text } = await generateText({
        model: provider.chat(modelId),
        prompt,
      });
      return text;
    },
    () => JSON.stringify({
      title: `Amazing ${topic}`,
      description: `Discover the secrets of ${topic}. Learn how to achieve amazing results!`,
      hashtags: [`#${topic.replace(/\s+/g, '')}`, '#trending', '#viral', '#tips', '#growth'],
    })
  );

  try {
    const parsed = JSON.parse(result);
    return {
      title: parsed.title || 'Untitled Design',
      description: parsed.description || '',
      hashtags: parsed.hashtags || [],
    };
  } catch {
    return {
      title: 'Untitled Design',
      description: topic,
      hashtags: [`#${topic.replace(/\s+/g, '')}`],
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export default async function canvaIntegrationRoutes(app: FastifyInstance) {
  // POST /api/canva/designs - Create designs from prompt
  app.post('/api/canva/designs', async (request, reply) => {
    try {
      const body = request.body as CanvaDesignRequest;
      const { topic, platforms, vibe, brandProfileId } = body;

      if (!topic || !platforms || platforms.length === 0) {
        return reply.status(400).send({ error: 'topic and platforms are required' });
      }

      // Check if Canva is connected
      const accessToken = await getCanvaAccessToken();
      if (!accessToken) {
        return reply.status(401).send({
          error: 'Canva not connected',
          message: 'Please connect Canva first in the Connector Hub',
          connectUrl: '/connectors?add=canva',
        });
      }

      // Generate AI content for each platform
      const designs: CanvaDesign[] = [];

      for (const platform of platforms) {
        try {
          // Generate content
          const content = await generateDesignContent(topic, platform, vibe || 'Bold', brandProfileId);

          // Create Canva design
          const designType = getDesignTypeForPlatform(platform);
          const canvaDesign = await createCanvaDesign(
            accessToken,
            content.title,
            designType
          );

          const dimensions = getDimensionsForPlatform(platform);

          designs.push({
            designId: canvaDesign.designId,
            title: content.title,
            editUrl: canvaDesign.editUrl,
            platform,
            dimensions,
          });
        } catch (platformError: any) {
          console.error(`[Canva] Error creating design for ${platform}:`, platformError.message);
          // Continue with other platforms
        }
      }

      if (designs.length === 0) {
        return reply.status(500).send({ error: 'Failed to create any designs' });
      }

      return {
        success: true,
        designs,
        topic,
        platforms,
      };
    } catch (err: any) {
      console.error('[Canva] Create designs error:', err);
      return reply.status(500).send({ error: err.message || 'Failed to create designs' });
    }
  });

  // GET /api/canva/status - Check if Canva is connected
  app.get('/api/canva/status', async (request, reply) => {
    try {
      const accessToken = await getCanvaAccessToken();
      return {
        connected: !!accessToken,
        provider: 'canva',
        name: 'Canva',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /api/connectors/canva/design-url — get a Canva deep link, or create a
  // real design when the user has an active Canva connector with a token.
  //
  // Every failure path degrades to a deep link rather than erroring: the
  // caller always gets a usable URL, and `isConnected` tells the UI whether
  // the design was actually created in the user's Canva account.
  app.get('/api/connectors/canva/design-url', async (request, reply) => {
    try {
      const { postContent, platform } = request.query as {
        postContent?: string;
        platform?: string;
        brandProfileId?: string;
      };

      const headline = (postContent || '').slice(0, 100);
      const bodyText = (postContent || '').slice(0, 500);
      const deepLink = () =>
        buildCanvaDeepLink({ platform: platform || 'instagram', headline, bodyText });

      let isConnected = false;
      let canvaUrl = '';

      try {
        const allConnectors = await db
          .select()
          .from(connectors)
          .where(eq(connectors.provider, 'canva'))
          .all();
        const activeCanva = allConnectors.find((c) => c.status === 'active');

        if (!activeCanva) {
          canvaUrl = deepLink();
        } else {
          isConnected = true;
          const accessToken = await credentialStore.getCredential(activeCanva.id, 'accessToken');

          if (accessToken) {
            const result = await createDesignFromText({
              accessToken,
              designTitle: headline || 'New Design',
              designType: 'instagram_post',
              brandColors: [],
              headline,
              bodyText,
            });
            canvaUrl = result.editUrl;
          } else {
            log.warn('Canva connector is active but has no stored access token; falling back to deep link', {
              connectorId: activeCanva.id,
            });
            canvaUrl = deepLink();
          }
        }
      } catch (err) {
        // Design creation failed (network, expired token, Canva API change).
        // A deep link still lets the user build the design by hand.
        log.warn('Canva design creation failed; falling back to deep link', {
          platform: platform || 'instagram',
          err: err instanceof Error ? err.message : String(err),
        });
        canvaUrl = deepLink();
      }

      return reply.status(200).send({ canvaUrl, isConnected });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
