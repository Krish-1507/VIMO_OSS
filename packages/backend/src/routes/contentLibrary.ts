import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { contentLibrary } from '../db/schema';
import { eq, and, desc, like } from 'drizzle-orm';
import { generateImage } from '../services/imageGenerationService';
import { generatePost, generateTextContent } from '../services/contentGenerationService';

export default async function contentLibraryRoutes(app: FastifyInstance) {
  // GET /api/content-library - list all library items
  app.get('/api/content-library', async (request, reply) => {
    const { brandProfileId, type, platform, status, search } = request.query as Record<string, string | undefined>;

    let conditions = [];
    if (brandProfileId) conditions.push(eq(contentLibrary.brandProfileId, brandProfileId));
    if (type) conditions.push(eq(contentLibrary.type, type));
    if (platform) conditions.push(eq(contentLibrary.platform, platform));
    if (status) conditions.push(eq(contentLibrary.status, status));
    if (search) conditions.push(like(contentLibrary.content, `%${search}%`));

    const items = await db
      .select()
      .from(contentLibrary)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(contentLibrary.generatedAt))
      .all();

    const parsed = items.map(item => ({
      ...item,
      mediaUrls: item.mediaUrlsJson ? JSON.parse(item.mediaUrlsJson) : [],
      metadata: item.metadataJson ? JSON.parse(item.metadataJson) : {},
      websiteContext: item.websiteContextJson ? JSON.parse(item.websiteContextJson) : null,
    }));

    return reply.send(parsed);
  });

  // GET /api/content-library/:id - get single item
  app.get('/api/content-library/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await db.select().from(contentLibrary).where(eq(contentLibrary.id, id)).get();
    if (!item) return reply.status(404).send({ error: 'Content not found' });

    return reply.send({
      ...item,
      mediaUrls: item.mediaUrlsJson ? JSON.parse(item.mediaUrlsJson) : [],
      metadata: item.metadataJson ? JSON.parse(item.metadataJson) : {},
      websiteContext: item.websiteContextJson ? JSON.parse(item.websiteContextJson) : null,
    });
  });

  // POST /api/content-library - create item manually
  app.post('/api/content-library', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(contentLibrary).values({
      id,
      brandProfileId: body.brandProfileId,
      type: body.type || 'social_post',
      platform: body.platform || null,
      title: body.title || null,
      content: body.content,
      mediaUrl: body.mediaUrl || null,
      mediaUrlsJson: body.mediaUrls ? JSON.stringify(body.mediaUrls) : null,
      metadataJson: body.metadata ? JSON.stringify(body.metadata) : null,
      status: body.status || 'draft',
      source: body.source || 'manual',
      websiteContextJson: body.websiteContext ? JSON.stringify(body.websiteContext) : null,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const item = await db.select().from(contentLibrary).where(eq(contentLibrary.id, id)).get();
    return reply.status(201).send({
      ...item,
      mediaUrls: [],
      metadata: body.metadata || {},
      websiteContext: body.websiteContext || null,
    });
  });

  // PUT /api/content-library/:id - update item
  app.put('/api/content-library/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;
    const now = new Date().toISOString();

    const updateData: Record<string, any> = { updatedAt: now };
    if (body.content !== undefined) updateData.content = body.content;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.platform !== undefined) updateData.platform = body.platform;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.mediaUrl !== undefined) updateData.mediaUrl = body.mediaUrl;
    if (body.mediaUrls !== undefined) updateData.mediaUrlsJson = JSON.stringify(body.mediaUrls);
    if (body.metadata !== undefined) updateData.metadataJson = JSON.stringify(body.metadata);
    if (body.type !== undefined) updateData.type = body.type;

    await db.update(contentLibrary).set(updateData).where(eq(contentLibrary.id, id)).run();

    const item = await db.select().from(contentLibrary).where(eq(contentLibrary.id, id)).get();
    if (!item) return reply.status(404).send({ error: 'Content not found' });

    return reply.send({
      ...item,
      mediaUrls: item.mediaUrlsJson ? JSON.parse(item.mediaUrlsJson) : [],
      metadata: item.metadataJson ? JSON.parse(item.metadataJson) : {},
      websiteContext: item.websiteContextJson ? JSON.parse(item.websiteContextJson) : null,
    });
  });

  // POST /api/content-library/generate - generate content directly into library
  app.post('/api/content-library/generate', async (request, reply) => {
    const { brandProfileId, type, platform, prompt, aspectRatio, mediaUrl } = request.body as {
      brandProfileId: string;
      type: string;
      platform?: string;
      prompt: string;
      aspectRatio?: string;
      mediaUrl?: string;
    };

    if (!brandProfileId || !type || !prompt) {
      return reply.status(400).send({ error: 'brandProfileId, type, and prompt are required' });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let generatedMediaUrl = mediaUrl || null;
    let generatedContent = prompt;
    let generatedImageSuggestion = '';
    let metadata: Record<string, any> = { prompt, source: 'creative_studio' };

    // Image generation
    if (type === 'image' && !generatedMediaUrl) {
      try {
        const ratioMap: Record<string, { width: number; height: number }> = {
          '1:1': { width: 1024, height: 1024 },
          '16:9': { width: 1920, height: 1080 },
          '9:16': { width: 1080, height: 1920 },
          '4:3': { width: 1024, height: 768 },
          '3:2': { width: 1200, height: 800 },
        };
        const dims = aspectRatio ? ratioMap[aspectRatio] : { width: 1024, height: 1024 };
        const result = await generateImage({ prompt, width: dims.width, height: dims.height });
        generatedMediaUrl = result.url;
        metadata.aspectRatio = aspectRatio || '1:1';
        metadata.provider = result.provider;
        metadata.model = result.model;
      } catch (err) {
        return reply.status(500).send({ error: 'Image generation failed: ' + (err as Error).message });
      }
    }

    // Social post generation — actual AI content generation
    if (type === 'social_post') {
      try {
        const result = await generatePost({
          brandProfileId,
          platform: platform || 'instagram',
          topic: prompt,
        });
        generatedContent = result.content;
        generatedImageSuggestion = result.imageSuggestion;
        metadata.generationType = 'ai_generated';
        metadata.hashtags = result.hashtags;
        metadata.imageSuggestion = result.imageSuggestion;
        metadata.contentType = result.contentType;
        // Optionally generate an image from the suggestion
        if (result.imageSuggestion) {
          try {
            const imgResult = await generateImage({ prompt: result.imageSuggestion, width: 1024, height: 1024 });
            generatedMediaUrl = imgResult.url;
          } catch {
            // non-critical — image suggestion is optional
          }
        }
      } catch (err) {
        metadata.generationType = 'fallback';
        metadata.generationError = (err as Error).message;
      }
    }

    // Video / script generation
    if (type === 'video') {
      try {
        metadata.aspectRatio = aspectRatio || '9:16';
        const videoContent = await generateTextContent({
          brandProfileId,
          platform: platform || 'tiktok',
          topic: prompt,
          format: 'video_script',
        });
        generatedContent = videoContent;
        metadata.generationType = 'ai_generated';
      } catch (err) {
        metadata.generationType = 'fallback';
        metadata.generationError = (err as Error).message;
      }
    }

    await db.insert(contentLibrary).values({
      id,
      brandProfileId,
      type,
      platform: platform || null,
      title: prompt.slice(0, 100),
      content: generatedContent,
      mediaUrl: generatedMediaUrl,
      mediaUrlsJson: generatedMediaUrl ? JSON.stringify([generatedMediaUrl]) : null,
      metadataJson: JSON.stringify(metadata),
      status: 'draft',
      source: 'ai_generated',
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const item = await db.select().from(contentLibrary).where(eq(contentLibrary.id, id)).get();
    return reply.status(201).send({
      ...item,
      mediaUrls: item?.mediaUrlsJson ? JSON.parse(item.mediaUrlsJson) : [],
      metadata: item?.metadataJson ? JSON.parse(item.metadataJson) : {},
      websiteContext: null,
    });
  });

  // POST /api/content-library/:id/edit-image - AI edit an image in a library item
  app.post('/api/content-library/:id/edit-image', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { editPrompt } = request.body as { editPrompt: string };

    if (!editPrompt) {
      return reply.status(400).send({ error: 'editPrompt is required' });
    }

    const item = await db.select().from(contentLibrary).where(eq(contentLibrary.id, id)).get();
    if (!item) return reply.status(404).send({ error: 'Content not found' });

    const fullPrompt = item.metadataJson
      ? `${JSON.parse(item.metadataJson).prompt || item.content}, ${editPrompt}`
      : `${item.content}, ${editPrompt}`;

    try {
      const metadata = item.metadataJson ? JSON.parse(item.metadataJson) : {};
      const aspectRatio = metadata.aspectRatio || '1:1';
      const ratioMap: Record<string, { width: number; height: number }> = {
        '1:1': { width: 1024, height: 1024 },
        '16:9': { width: 1920, height: 1080 },
        '9:16': { width: 1080, height: 1920 },
        '4:3': { width: 1024, height: 768 },
        '3:2': { width: 1200, height: 800 },
      };
      const dims = ratioMap[aspectRatio] || { width: 1024, height: 1024 };

      const result = await generateImage({
        prompt: fullPrompt,
        width: dims.width,
        height: dims.height,
      });

      const now = new Date().toISOString();
      const mediaUrls = [result.url];
      const updatedMetadata = {
        ...metadata,
        editHistory: [
          ...(metadata.editHistory || []),
          { editPrompt, editedAt: now, previousMediaUrl: item.mediaUrl },
        ],
      };

      await db.update(contentLibrary)
        .set({
          mediaUrl: result.url,
          mediaUrlsJson: JSON.stringify(mediaUrls),
          metadataJson: JSON.stringify(updatedMetadata),
          updatedAt: now,
        })
        .where(eq(contentLibrary.id, id))
        .run();

      const updated = await db.select().from(contentLibrary).where(eq(contentLibrary.id, id)).get();
      return reply.send({
        ...updated,
        mediaUrls: updated?.mediaUrlsJson ? JSON.parse(updated.mediaUrlsJson) : [],
        metadata: updated?.metadataJson ? JSON.parse(updated.metadataJson) : {},
        websiteContext: null,
      });
    } catch (err) {
      return reply.status(500).send({ error: 'Image edit failed: ' + (err as Error).message });
    }
  });

  // DELETE /api/content-library/:id - delete item
  app.delete('/api/content-library/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(contentLibrary).where(eq(contentLibrary.id, id)).run();
    return reply.status(204).send();
  });
}
