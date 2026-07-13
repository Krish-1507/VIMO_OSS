import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles, scheduledPosts, contentLibrary } from '../db/schema';
import { generateVoiceFingerprint, initVectorStore, addExampleToVectorStore, buildBrandContext } from '../services/brandBrainService';
import { TaskType, getModelForTask } from '../lib/modelRouter';
import { callWithProviderChain } from '../lib/llmProvider';
import { generateText } from 'ai';
import * as schedulerService from '../services/schedulerService';
import { formatError } from '../lib/errorFormatter';
import { crawlWebsite, buildWebsitePrompt, type WebsiteAnalysis } from '../services/websiteCrawler';

const WEEKLY_TOPICS_PROMPT = (name: string, industry: string, audience: string, website: string, toneKeywords: string[], websiteContext?: string) => `You are a creative content strategist for "${name}" (${industry}), targeting ${audience}.

Brand website: ${website || 'Not provided'}
Brand tone: ${toneKeywords.join(', ') || 'Professional'}
${websiteContext ? `\nWEBSITE ANALYSIS:\n${websiteContext}\n` : ''}

Generate 7 unique, engaging content topics/themes — one per day for the next week — that will resonate with this brand's audience. Use the website analysis to make topics specific to what this brand actually does (products, services, values). Each topic should be specific enough to generate a focused social media post about.

Return ONLY a JSON array of exactly 7 strings. Each string is a complete, specific topic (not a generic category).

Example return format:
["Why [Industry] Needs to Rethink [X] in 2026", "The Untold Story Behind [Y]", "5 Tools Every [Audience] Should Know About"]`;

const POST_CONTENT_PROMPT = (name: string, industry: string, audience: string, website: string, toneKeywords: string[], topic: string, platform: string, websiteContext?: string) => `You are a social media content writer for "${name}" — a ${industry} brand targeting ${audience}.

Brand website: ${website || 'Not provided'}
Brand tone keywords: ${toneKeywords.join(', ') || 'Professional'}
${websiteContext ? `\nWEBSITE ANALYSIS (reference these details to make the post authentic):\n${websiteContext}\n` : ''}

Write a ${platform} post about: "${topic}"

Reference specific products, services, or values from the website analysis to make the post authentic. The post should:
- Be authentic and valuable to the target audience
- Reflect the brand's tone (${toneKeywords.join(', ') || 'Professional'})
- Include a hook in the first line
- End with a question or call-to-action
- Include relevant hashtags inline (${platform === 'linkedin' ? '2-3 hashtags' : platform === 'twitter' ? '1-2 hashtags' : '3-5 hashtags'})
- Be within platform character limits

Return ONLY a JSON object with:
  content (string — the full post text including hashtags),
  imageSuggestion (string — a detailed visual description for an image that would accompany this post, specific to the brand's products/services)`;

// DNA analysis prompt — extracts brand identity from crawled website data
const DNA_ANALYSIS_PROMPT = (data: any) => `You are a brand identity analyst. Analyze the following website data and extract the brand's complete DNA.

WEBSITE DATA:
${JSON.stringify(data, null, 2)}

The data includes extracted text content, headings, meta tags, and raw HTML. Use ALL of it to identify the brand's identity.

IMPORTANT GUIDELINES:
- If you find colors in the CSS or inline styles, use them. If the primary brand color is not obvious, look at the most frequently used color in the CSS.
- If you find fonts in font-family declarations or Google Fonts imports, include them.
- If the raw HTML contains visible text content (anything between tags like <p>, <h1>-<h6>, <li>, <span>, <div>, <section>), use it to determine the brand aesthetic, tone, values, and audience.
- NEVER return "Not detected" or empty strings. ALWAYS make your best inference from the available data.
- If visualStyleKeywords can't be determined from text, infer from the colors, fonts, and industry (e.g., if the brand uses bright colors and playful fonts → "playful", "colorful", "modern").

Extract and return ONLY a JSON object with these fields (every field is REQUIRED — never omit any):
{
  "brandName": "string — the business name (use site title or URL if unknown)",
  "tagline": "string — brand tagline or motto if found, or a brief tagline inferred from the content",
  "businessOverview": "string — 2-3 sentence summary of what the business does, who they serve, and their mission",
  "brandValues": ["string — 3-6 core values as short phrases (e.g. 'Innovation', 'Sustainability')"],
  "brandAesthetic": "string — 1 sentence describing visual style (e.g. 'Minimalist with warm tones and organic textures')",
  "toneOfVoice": "string — 1 sentence describing communication style (e.g. 'Friendly, conversational, and knowledgeable')",
  "targetAudience": "string — who they serve",
  "uniqueSellingPoints": ["string — 3-5 key differentiators"],
  "colors": {
    "primary": "string — hex code of primary brand color found (REQUIRED — infer from CSS or most used color)",
    "secondary": "string — hex code of secondary brand color found (REQUIRED — infer from CSS)",
    "accent": "string — hex code of accent color if found (omit if none)"
  },
  "fonts": {
    "headings": "string — font family used for headings if detectable (omit if none)",
    "body": "string — font family used for body text if detectable (omit if none)"
  },
  "industry": "string — their industry (derive from products/services/content)",
  "visualStyleKeywords": ["string — 3-5 keywords describing imagery style (e.g. 'clean', 'corporate', 'playful', 'dark')"]
}`;

export default async function brandProfileRoutes(app: FastifyInstance) {
  app.get('/api/brand-profiles', async (request, reply) => {
    try {
      const rows = await db.select().from(brandProfiles).all();
      return rows.map((row) => ({
        ...row,
        toneKeywords: JSON.parse(row.toneKeywordsJson),
        examplePosts: JSON.parse(row.examplePostsJson),
        logoUrl: row.logoUrl || null,
      }));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/brand-profiles/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const row = await db.select().from(brandProfiles).where(eq(brandProfiles.id, id)).get();
      if (!row) {
        return reply.status(404).send({ error: 'Brand profile not found' });
      }
      return {
        ...row,
        toneKeywords: JSON.parse(row.toneKeywordsJson),
        examplePosts: JSON.parse(row.examplePostsJson),
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/brand-profiles', async (request, reply) => {
    try {
      const { name, industry, audience, website, logoUrl, toneKeywords, examplePosts, contentDNA } = request.body as {
        name: string;
        industry: string;
        audience: string;
        website?: string;
        logoUrl?: string;
        toneKeywords: string[];
        examplePosts: string[];
        contentDNA?: string;
      };

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      let voiceFingerprint = null;
      try {
        voiceFingerprint = await generateVoiceFingerprint({
          id,
          name,
          industry,
          audience,
          toneKeywords,
          examplePosts,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        console.warn('Voice fingerprint generation skipped:', err instanceof Error ? err.message : err);
      }

      try {
        await initVectorStore(id);
        for (const post of examplePosts) {
          await addExampleToVectorStore(id, post);
        }
      } catch (err) {
        console.warn('Vector store initialization skipped:', err instanceof Error ? err.message : err);
      }

      const created = {
        id,
        name,
        industry,
        audience,
        website: website || null,
        logoUrl: logoUrl || null,
        toneKeywordsJson: JSON.stringify(toneKeywords || []),
        examplePostsJson: JSON.stringify(examplePosts || []),
        voiceFingerprint,
        contentDNA: contentDNA || null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(brandProfiles).values(created);

      return reply.status(201).send({ ...created, toneKeywords, examplePosts });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.put('/api/brand-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      industry?: string;
      audience?: string;
      website?: string;
      logoUrl?: string;
      toneKeywords?: string[];
      examplePosts?: string[];
    };

    const existing = await db.select().from(brandProfiles).where(eq(brandProfiles.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ error: 'Brand profile not found' });
    }

    const toneKeywords = body.toneKeywords || JSON.parse(existing.toneKeywordsJson);
    const examplePosts = body.examplePosts || JSON.parse(existing.examplePostsJson);
    const now = new Date().toISOString();

    let voiceFingerprint = existing.voiceFingerprint;
    if (body.toneKeywords !== undefined || body.examplePosts !== undefined) {
      try {
        voiceFingerprint = await generateVoiceFingerprint({
          id,
          name: body.name ?? existing.name,
          industry: body.industry ?? existing.industry,
          audience: body.audience ?? existing.audience,
          toneKeywords,
          examplePosts,
          createdAt: existing.createdAt,
          updatedAt: now,
        });
      } catch (err) {
        console.warn('Voice fingerprint regeneration skipped:', err instanceof Error ? err.message : err);
        voiceFingerprint = existing.voiceFingerprint;
      }
    }

    await db.update(brandProfiles)
      .set({
        name: body.name ?? existing.name,
        industry: body.industry ?? existing.industry,
        audience: body.audience ?? existing.audience,
        website: body.website !== undefined ? body.website : existing.website,
        logoUrl: body.logoUrl !== undefined ? body.logoUrl : existing.logoUrl,
        toneKeywordsJson: JSON.stringify(toneKeywords),
        examplePostsJson: JSON.stringify(examplePosts),
        voiceFingerprint,
        updatedAt: now,
      })
      .where(eq(brandProfiles.id, id))
      .run();

    return { ...existing, ...body, toneKeywords, examplePosts, voiceFingerprint, updatedAt: now };
  });

  app.delete('/api/brand-profiles/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(brandProfiles).where(eq(brandProfiles.id, id)).run();
    return { success: true };
  });

  // Generate text by trying: AI provider → Pollinations API → template fallback
  async function pollinate(prompt: string, templateFallback: () => string): Promise<string> {
    // 1. Try configured LLM provider (fast timeout)
    try {
      const modelRoute = await getModelForTask(TaskType.CONTENT_GENERATION);
      const result: string = await Promise.race([
        callWithProviderChain(
          'content generation',
          async (provider: any, modelId: string) => {
            const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
            return t;
          },
          undefined,
          modelRoute
        ),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Provider timeout')), 8000)),
      ]);
      if (result) return result;
    } catch (err: any) {
      console.warn('[Pollinate] Configured provider failed:', err.message);
    }

    // 2. Try direct Pollinations.ai fetch (fast timeout)
    for (const attempt of [
      async () => {
        const res = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: 'openai' }),
          signal: AbortSignal.timeout(5000),
        });
        return res.ok ? await res.text() : null;
      },
      async () => {
        const simplePrompt = prompt.slice(0, 200);
        const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(simplePrompt)}`, {
          signal: AbortSignal.timeout(5000),
        });
        return res.ok ? await res.text() : null;
      },
    ]) {
      try {
        const text = await attempt();
        if (text && text.length > 10) return text;
      } catch (err: any) {
        console.warn('[Pollinate] API attempt failed:', err.message);
      }
    }

    // 3. Template fallback
    return templateFallback();
  }

  function templateWeekTopics(name: string, industry: string, audience: string): string[] {
    const templates = [
      `Why ${industry} is Evolving Faster Than Ever in 2026`,
      `5 Essential ${industry} Strategies for ${audience}`,
      `The ${industry} Trend Nobody is Talking About`,
      `How ${name} is Changing the ${industry} Landscape`,
      `A Day in the Life at ${name}: Behind the Scenes`,
      `${audience}: Here's What You Need to Know About ${industry}`,
      `Weekly ${industry} Roundup: Top Stories This Week`,
    ];
    return templates;
  }

  function templatePostContent(topic: string, name: string, industry: string, audience: string, platform: string, toneKeywords: string[]): string {
    const hooks = [
      `Let's talk about ${topic.toLowerCase()} 👇`,
      `Something we've been thinking about: ${topic}`,
      `Did you know? ${topic}`,
      `${topic} — here's why it matters`,
      `We asked our team about ${topic.toLowerCase()}, and here's what they said`,
    ];
    const ctas = [
      `What do you think? Drop a comment below!`,
      `Save this for later and share with your team 📌`,
      `Tag someone who needs to see this 👇`,
      `Double tap if you agree! ❤️`,
      `Let us know your thoughts in the comments!`,
    ];
    const hook = hooks[Math.floor(Math.random() * hooks.length)];
    const cta = ctas[Math.floor(Math.random() * ctas.length)];
    const hashtags = platform === 'linkedin'
      ? `\n\n#${industry.replace(/\s+/g, '')} #${audience.replace(/\s+/g, '')} #MarketingTips`
      : platform === 'twitter'
      ? `\n\n#${industry.replace(/\s+/g, '')} #${name.replace(/\s+/g, '')}`
      : `\n\n#${industry.replace(/\s+/g, '')} #${audience.replace(/\s+/g, '')} #${name.replace(/\s+/g, '')} #Innovation #Growth`;

    return `${hook}\n\nAt ${name}, we're passionate about ${industry.toLowerCase()}. ${topic} is one of the most important topics for ${audience.toLowerCase()} right now.\n\n${cta}${hashtags}`;
  }

  // POST /api/brand-profiles/:id/generate-week
  app.post('/api/brand-profiles/:id/generate-week', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '5 minutes'
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const brand = await db.select().from(brandProfiles).where(eq(brandProfiles.id, id)).get();
    if (!brand) {
      return reply.status(404).send({ error: 'Brand profile not found' });
    }

    const toneKeywords = JSON.parse(brand.toneKeywordsJson) as string[];
    const now = new Date();

    // Step 1: Crawl website for rich context (with timeout)
    console.log('[GenerateWeek] Crawling website:', brand.website);
    let websiteAnalysis: WebsiteAnalysis | null = null;
    let websiteContextStr = '';
    if (brand.website) {
      try {
        websiteAnalysis = await Promise.race([
          crawlWebsite(brand.website),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 25000)),
        ]);
      } catch { websiteAnalysis = null; }
      websiteContextStr = buildWebsitePrompt(websiteAnalysis, brand.name, brand.industry);
      if (websiteAnalysis) {
        // Auto-save extracted logo URL to brand profile
        if (websiteAnalysis.logoUrl && websiteAnalysis.logoUrl !== brand.logoUrl) {
          try {
            await db.update(brandProfiles).set({ logoUrl: websiteAnalysis.logoUrl, updatedAt: new Date().toISOString() }).where(eq(brandProfiles.id, id)).run();
            console.log('[GenerateWeek] Saved extracted logo:', websiteAnalysis.logoUrl);
          } catch { /* non-critical */ }
        }
        console.log('[GenerateWeek] Website crawled:', websiteAnalysis.title, '-', websiteAnalysis.keywords.length, 'keywords,', websiteAnalysis.services.length, 'services,', websiteAnalysis.pagesCrawled, 'pages');
      } else {
        console.warn('[GenerateWeek] Website crawl failed/timed out, using brand-only context');
      }
    }

    // Step 2: Build topics - try AI, fall back to templates
    let topics: string[] = [];
    console.log('[GenerateWeek] Generating weekly topics...');
    const topicsText = await pollinate(
      WEEKLY_TOPICS_PROMPT(brand.name, brand.industry, brand.audience, brand.website || '', toneKeywords, websiteContextStr),
      () => JSON.stringify(templateWeekTopics(brand.name, brand.industry, brand.audience))
    );
    try {
      topics = JSON.parse(topicsText.trim());
      if (!Array.isArray(topics) || topics.length !== 7) throw new Error('Invalid topics response');
      console.log('[GenerateWeek] Topics ready');
    } catch {
      topics = templateWeekTopics(brand.name, brand.industry, brand.audience);
    }

    // Step 3: Generate each post
    const platforms = ['instagram', 'linkedin', 'twitter', 'tiktok'];
    const createdItems: any[] = [];

    for (let i = 0; i < 7; i++) {
      const scheduleDate = new Date(now);
      scheduleDate.setDate(scheduleDate.getDate() + i + 1);
      scheduleDate.setHours(10 + (i % 3) * 4, 0, 0, 0);

      const platform = platforms[i % platforms.length];
      const topic = topics[i];

      // Generate post content
      let content: string;
      let imageSuggestion: string = '';
      console.log(`[GenerateWeek] Generating post ${i + 1}/7 for ${platform}: "${topic}"`);
      const contentText = await pollinate(
        POST_CONTENT_PROMPT(brand.name, brand.industry, brand.audience, brand.website || '', toneKeywords, topic, platform, websiteContextStr),
        () => JSON.stringify({
          content: templatePostContent(topic, brand.name, brand.industry, brand.audience, platform, toneKeywords),
          imageSuggestion: `Professional image related to ${topic}`,
        })
      );
      try {
        const parsed = JSON.parse(contentText.trim());
        content = parsed.content;
        imageSuggestion = parsed.imageSuggestion || '';
      } catch {
        content = contentText.trim();
      }
      console.log(`[GenerateWeek] Post ${i + 1} content ready`);

      // Generate beautiful brand-specific image via Pollinations.ai
      let mediaUrl: string | null = null;
      try {
        const products = websiteAnalysis?.products?.slice(0, 3).join(', ') || brand.industry;
        const brandStyle = websiteAnalysis?.brandValues?.slice(0, 2).join(', ') || 'professional';
        const brandColor = websiteAnalysis?.brandColor || '';

        // Build a rich, brand-specific image prompt
        const imagePrompt = [
          imageSuggestion || `Professional ${brand.industry} marketing visual: ${topic}`,
          `Showcasing ${products}`,
          `${brand.name} brand style, ${brandStyle}`,
          brandColor ? `Brand colors: ${brandColor}` : '',
          'Clean aesthetic, high quality, professional photography, soft lighting',
          'Social media post background, beautiful composition',
          'Suitable for marketing, promotional content',
        ].filter(Boolean).join('. ');

        const encodedPrompt = encodeURIComponent(imagePrompt.slice(0, 800));

        // Use seed for consistency per topic
        const seed = Math.abs(topic.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 999999;

        mediaUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;

        // If brand has a logo URL, include it for compositing context in metadata
        console.log(`[GenerateWeek] Post ${i + 1} image generated (seed: ${seed})`);
      } catch (err: any) {
        console.warn(`[GenerateWeek] Post ${i + 1} image generation failed:`, err.message);
      }

      // Save to content library
      try {
        const libraryId = crypto.randomUUID();
        const nowISO = now.toISOString();

        await db.insert(contentLibrary).values({
          id: libraryId,
          brandProfileId: id,
          type: 'social_post',
          platform: platform,
          title: topic,
          content: content,
          mediaUrl: mediaUrl,
          mediaUrlsJson: mediaUrl ? JSON.stringify([mediaUrl]) : null,
          metadataJson: JSON.stringify({
            topic,
            imageSuggestion,
            weekGeneration: true,
            weekIndex: i + 1,
            weekTotal: 7,
            weekStart: new Date(now.getTime() + 86400000).toISOString().split('T')[0],
          }),
          status: 'draft',
          source: 'ai_generated',
          websiteContextJson: websiteAnalysis ? JSON.stringify(websiteAnalysis) : null,
          generatedAt: nowISO,
          createdAt: nowISO,
          updatedAt: nowISO,
        });

        // Also save as scheduled post
        const postId = crypto.randomUUID();
        const scheduledAt = scheduleDate.toISOString();
        const postData = {
          id: postId,
          campaignId: null as string | null,
          brandProfileId: id,
          content: content,
          platform: platform,
          scheduledAt: scheduledAt,
          status: 'pending' as const,
          mediaUrlsJson: mediaUrl ? JSON.stringify([mediaUrl]) : null,
          metadataJson: JSON.stringify({ topic, imageSuggestion, weekGeneration: true, contentLibraryId: libraryId }),
          createdAt: nowISO,
          updatedAt: nowISO,
        };

        await db.insert(scheduledPosts).values(postData);
        await schedulerService.schedulePost(postData);

        createdItems.push({
          id: libraryId,
          scheduledPostId: postId,
          title: topic,
          content,
          platform,
          mediaUrl,
          mediaUrls: mediaUrl ? [mediaUrl] : [],
          scheduledAt,
          metadata: { topic, imageSuggestion, weekGeneration: true },
        });
        console.log(`[GenerateWeek] Post ${i + 1} saved (library + schedule)`);
      } catch (err: any) {
        console.error(`[GenerateWeek] Failed to save post ${i + 1}:`, err.message);
      }
    }

    if (createdItems.length === 0) {
      return reply.status(500).send({ error: 'Failed to create any posts' });
    }

    return reply.status(201).send({
      posts: createdItems,
      weekStart: new Date(now.getTime() + 86400000).toISOString().split('T')[0],
      weekEnd: new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0],
      websiteCrawled: !!websiteAnalysis,
      websiteTitle: websiteAnalysis?.title || null,
    });
  });

  app.get('/api/brand-profiles/:id/preview', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { topic } = request.query as { topic?: string };
    const promptTopic = topic || 'brand introduction';

    const context = await buildBrandContext(id, promptTopic);
    const modelRoute = await getModelForTask(TaskType.CONTENT_GENERATION);
    const text = await callWithProviderChain(
      'preview generation',
      async (provider, modelId) => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt: `${context}\n\nGenerate a sample Instagram post about "${promptTopic}". Keep it concise and engaging.`,
        });
        return t;
      },
      () => `Here is a sample post about ${promptTopic} for your brand.`,
      modelRoute
    );
    return { post: text.trim() };
  });

  app.get('/api/brand-profiles/live-preview', async (request) => {
    const { topic, name, industry, audience, toneKeywords, examplePosts } = request.query as {
      topic?: string;
      name?: string;
      industry?: string;
      audience?: string;
      toneKeywords?: string;
      examplePosts?: string;
    };
    const promptTopic = topic || 'brand introduction';
    const toneList = toneKeywords ? toneKeywords.split(',') : [];
    const postList = examplePosts ? examplePosts.split('---') : [];

    const context = [
      'BRAND VOICE PROFILE:',
      `Name: ${name || 'Unknown'}`,
      `Industry: ${industry || 'Unknown'}`,
      `Audience: ${audience || 'Unknown'}`,
      `Tone: ${toneList.join(', ')}`,
      'RELEVANT EXAMPLE POSTS:',
      ...postList.map((p, i) => `Post ${i + 1}: ${p}`),
    ].join('\n');

    await getModelForTask(TaskType.CONTENT_GENERATION);
    const text = await callWithProviderChain(
      'live preview generation',
      async (provider, modelId) => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt: `${context}\n\nGenerate a sample Instagram post about "${promptTopic}". Keep it concise and engaging.`,
        });
        return t;
      },
      () => `Here is a sample post about ${promptTopic} for your brand.`
    );
    return { post: text.trim() };
  });

  // POST /api/brand-profiles/analyze-dna — analyze a website and extract brand DNA (Pomelli-style)
  app.post('/api/brand-profiles/analyze-dna', async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: 'URL is required' });

    try {
      // Step 1: Crawl the website
      const websiteData = await crawlWebsite(url);
      if (!websiteData) return reply.status(400).send({ error: 'Could not analyze this website. Check the URL and try again.' });

      // Step 2: Use LLM to extract brand DNA
      const modelRoute = await getModelForTask(TaskType.CONTENT_GENERATION);
      const dnaJson = await callWithProviderChain(
        'dna analysis',
        async (provider, modelId) => {
          const { text: t } = await generateText({
            model: provider.chat(modelId),
            prompt: DNA_ANALYSIS_PROMPT(websiteData),
            temperature: 0.3,
          });
          return t;
        },
        () => JSON.stringify({
          brandName: websiteData.title || new URL(url).hostname.replace('www.', '') || 'Unknown Brand',
          tagline: websiteData.description?.split('.')[0] || '',
          businessOverview: websiteData.description || `${websiteData.title || 'A business'} in ${websiteData.keywords?.slice(0, 3).join(', ') || 'their industry'}.`,
          brandValues: websiteData.brandValues?.length > 0 ? websiteData.brandValues : ['Quality', 'Innovation', 'Customer Focus'],
          brandAesthetic: websiteData.colorsDiscovered?.length > 0
            ? `Professional with ${websiteData.colorsDiscovered[0]} as a primary color accent.`
            : 'Clean and modern professional design.',
          toneOfVoice: 'Professional, informative, and engaging.',
          targetAudience: websiteData.targetAudience || 'Professionals and businesses in their industry',
          uniqueSellingPoints: websiteData.uniqueSellingPoints?.length > 0 ? websiteData.uniqueSellingPoints : ['Industry expertise', 'Quality service', 'Customer satisfaction'],
          colors: {
            primary: websiteData.brandColor || websiteData.colorsDiscovered?.[0] || '#3B82F6',
            secondary: websiteData.colorsDiscovered?.[1] || '#6366F1',
            accent: websiteData.colorsDiscovered?.[2] || '#8B5CF6',
          },
          fonts: {
            headings: websiteData.fontsDiscovered?.[0] || '',
            body: websiteData.fontsDiscovered?.[1] || websiteData.fontsDiscovered?.[0] || '',
          },
          industry: (websiteData.keywords?.slice(0, 2).join(', ')) || 'Business Services',
          visualStyleKeywords: websiteData.colorsDiscovered?.length > 0
            ? ['professional', 'modern', 'clean', 'corporate']
            : ['professional', 'clean', 'modern'],
        }),
        modelRoute
      );

      let dna: Record<string, any>;
      try {
        const cleaned = dnaJson.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        dna = JSON.parse(cleaned);
      } catch {
        dna = {
          brandName: websiteData.title || new URL(url).hostname.replace('www.', '') || 'Unknown Brand',
          tagline: websiteData.description?.split('.')[0] || '',
          businessOverview: websiteData.description || `${websiteData.title || 'A business'} in their industry.`,
          brandValues: websiteData.brandValues?.length > 0 ? websiteData.brandValues : ['Quality', 'Innovation', 'Customer Focus'],
          brandAesthetic: websiteData.colorsDiscovered?.length > 0
            ? `Professional with ${websiteData.colorsDiscovered[0]} as a primary color accent.`
            : 'Clean and modern professional design.',
          toneOfVoice: 'Professional, informative, and engaging.',
          targetAudience: websiteData.targetAudience || 'Professionals and businesses in their industry.',
          uniqueSellingPoints: websiteData.uniqueSellingPoints?.length > 0 ? websiteData.uniqueSellingPoints : ['Industry expertise', 'Quality service', 'Customer satisfaction'],
          colors: {
            primary: websiteData.brandColor || websiteData.colorsDiscovered?.[0] || '#3B82F6',
            secondary: websiteData.colorsDiscovered?.[1] || '#6366F1',
            accent: websiteData.colorsDiscovered?.[2] || '#8B5CF6',
          },
          fonts: {
            headings: websiteData.fontsDiscovered?.[0] || '',
            body: websiteData.fontsDiscovered?.[1] || websiteData.fontsDiscovered?.[0] || '',
          },
          industry: websiteData.keywords?.slice(0, 2).join(', ') || 'Business Services',
          visualStyleKeywords: websiteData.colorsDiscovered?.length > 0
            ? ['professional', 'modern', 'clean', 'corporate']
            : ['professional', 'clean', 'modern'],
        };
      }

      // Step 3: Return the DNA + raw website data
      return reply.send({
        dna,
        website: {
          logoUrl: websiteData.logoUrl,
          brandColor: websiteData.brandColor,
          socialLinks: websiteData.socialLinks,
          pagesCrawled: websiteData.pagesCrawled,
        },
      });
    } catch (err) {
      return reply.status(500).send({ error: 'DNA analysis failed: ' + (err as Error).message });
    }
  });
}
