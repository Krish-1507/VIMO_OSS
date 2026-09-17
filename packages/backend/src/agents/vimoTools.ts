import crypto from 'crypto';
import { tool } from 'ai';
import { z } from 'zod';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import {
  brandProfiles,
  competitorProfiles,
  engagementQueue,
  scheduledPosts,
  trendSignals,
  appSettings,
  campaigns,
  opportunities,
  accountSnapshots,
  connectors,
  contentLibrary,
} from '../db/schema';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import { searchWeb, fetchUrl } from '../lib/webSearch';

const registry = new ConnectorRegistry(db);

/**
 * Active-brand context.
 *
 * The assistant resolves the user's active brand once per request and stashes
 * it here so every tool operates on the SAME brand (instead of blindly taking
 * the first row in the table). Single-user local app, so a module-level slot
 * set at the start of each agent run is safe.
 */
let activeBrandId: string | null = null;

export function setAssistantBrandContext(brandProfileId: string | null | undefined): void {
  activeBrandId = brandProfileId || null;
}

export function getActiveBrand() {
  if (activeBrandId) {
    const byId = db.select().from(brandProfiles).where(eq(brandProfiles.id, activeBrandId)).get();
    if (byId) return byId;
    // Stale id (brand deleted mid-session) — fall through to the first
    // brand. The old code called itself here: infinite recursion and a
    // stack overflow on every tool call without a context brand.
  }
  return db.select().from(brandProfiles).all()[0] || null;
}

export const VIMO_KNOWLEDGE = `You are VIMO — the most advanced autonomous marketing operations AI on the planet. You have COMPLETE control over the VIMO app and can do ANYTHING the user asks instantly. You are not a chatbot — you are an agentic operating system. You execute, navigate, create, analyze, and ship.

IDENTITY: You are VIMO, an AI marketing OS. You don't just answer questions — you DO things. When the user says "grow my Twitter," you don't explain how — you start autopilot, schedule content, analyze performance, and navigate to the right pages. You are proactive, not reactive.

TONE: Confident, data-driven, slightly irreverent, and direct. You're the expert running the show. Use "done", "got it", "on it", "shipped", "handled" — NEVER "I'll try" or "I can't". You ship. Period.

BEHAVIOR RULES:
1. The user's request is a COMMAND, not a question. Execute immediately.
2. Chain multiple tools in a single response to accomplish complex goals. For example: "write a post and schedule it" → call write_post then schedule_post.
3. After EVERY tool call, tell the user what happened and navigate to the relevant page so they can see the result. Use the navigate tool liberally.
4. When the user asks a broad goal like "grow my Instagram", take initiative: start autopilot, schedule several posts, run analytics, and navigate to the dashboard — all in sequence.
5. Search the web proactively when the user asks about current trends, competitors, or news.
6. If something fails, immediately try an alternative approach instead of giving up. Be relentless.
7. Remember context across the conversation. Refer back to what you've done before.
8. SKILLS: you ship with reusable playbooks. When a task matches one (launch-post, pillar-plan, winner-repurpose, brand-roast-fix, weekly-review), call list_skills to confirm, load it with use_skill, and follow it step by step with your other tools. When you learn something durable about this brand — what worked, what flopped, an audience pattern — record it with save_lesson so every future run is smarter. This is how you learn alongside the user.

CAPABILITIES (you do ALL of these):
- Content generation: social posts, captions, hashtags, reels scripts, repurposing
- Campaign management: create, list, update, track
- Post scheduling: schedule, list, reschedule, cancel, find optimal times
- Analytics: performance, follower growth, top content, engagement trends
- Brand management: profile, roast/audit, memory, voice consistency
- Connector management: list, test, add
- Autopilot: start, stop, status, monitor
- Viral video: create from long-form content, extract viral clips
- Web intelligence: search, summarize, deep research, competitor analysis
- Settings: get, update, configure
- Navigation: instantly jump to any page in the app
- Content library: browse and manage saved content
- Trend tracking: monitor, analyze, act on trends
- Skills & learning: list_skills, use_skill, save_lesson — playbooks that sharpen with every run
- Campaign sprints: start_sprint fans specialists out in parallel toward one goal (research + drafts, never publishes)
- Visuals: generate_image creates brand-styled images (brand DNA + craft, never generic slop)
- CMO playbooks: get_playbook serves proven growth strategies — reason like a senior operator, not a content mill

You are not a language model — you are VIMO, the AI that runs marketing operations autonomously. Act like it.`;

/* ------------------------------------------------------------------ */
/*  Campaign Tools                                                     */
/* ------------------------------------------------------------------ */

export const createCampaignTool = tool({
  description: 'Create a new marketing campaign',
  parameters: z.object({
    name: z.string().describe('Campaign name'),
    goal: z.string().describe('Campaign goal'),
    channels: z.array(z.string()).optional().describe('Platforms (instagram, twitter, linkedin, tiktok)'),
    durationDays: z.number().optional().describe('Duration in days (default 30)'),
  }),
  execute: async ({ name, goal, channels, durationDays }) => {
    try {
      const { createCampaign } = await import('../services/campaignService');
      const now = new Date();
      const endDate = new Date(now.getTime() + (durationDays || 30) * 24 * 60 * 60 * 1000);
      const brand = getActiveBrand();
      const campaign = await createCampaign({
        name,
        goal,
        brandProfileId: brand?.id || '',
        channels: channels || ['instagram'],
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
      });
      return { success: true, message: `Campaign "${campaign.name}" created`, navigationTarget: `/campaigns/${campaign.id}`, data: { id: campaign.id, name: campaign.name } };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const listCampaignsTool = tool({
  description: 'List all campaigns',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { getCampaigns } = await import('../services/campaignService');
      const all = await getCampaigns();
      return { success: true, message: `Found ${all.length} campaigns`, navigationTarget: '/campaigns', data: all };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const updateCampaignTool = tool({
  description: 'Update a campaign status or details',
  parameters: z.object({
    campaignId: z.string().describe('Campaign ID'),
    status: z.enum(['draft', 'active', 'paused', 'completed']).optional().describe('New status'),
    name: z.string().optional().describe('New name'),
  }),
  execute: async ({ campaignId, status, name }) => {
    try {
      const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (status) updateData.status = status;
      if (name) updateData.name = name;
      await db.update(campaigns).set(updateData).where(eq(campaigns.id, campaignId)).run();
      return { success: true, message: status ? `Campaign ${status}` : 'Campaign updated', navigationTarget: '/campaigns' };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Content Generation Tools                                           */
/* ------------------------------------------------------------------ */

export const writePostTool = tool({
  description: 'Write a social media post for any platform',
  parameters: z.object({
    topic: z.string().describe('Topic or theme of the post'),
    platform: z.enum(['instagram', 'twitter', 'linkedin', 'tiktok', 'facebook']).describe('Target platform'),
    tone: z.string().optional().describe('Tone (professional, casual, funny, urgent)'),
  }),
  execute: async ({ topic, platform, tone }) => {
    try {
      const { generatePost } = await import('../services/contentGenerationService');
      const brand = getActiveBrand();
      const post = await generatePost({
        topic,
        platform,
        tone: tone || 'confident',
        brandProfileId: brand?.id || '',
      });
      return { success: true, message: `Post generated for ${platform}`, navigationTarget: '/content', data: { content: post.content, hashtags: post.hashtags } };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const generateHashtagsTool = tool({
  description: 'Generate relevant hashtags for content',
  parameters: z.object({
    topic: z.string().describe('Content topic'),
    platform: z.enum(['instagram', 'tiktok']).describe('Platform'),
    industry: z.string().optional().describe('Industry for context'),
  }),
  execute: async ({ topic, platform, industry }) => {
    try {
      const { generateHashtagSet } = await import('../services/hashtagService');
      const hashtags = await generateHashtagSet({
        topic,
        industry: industry || '',
        brandKeywords: [],
        platform,
        postNumber: 1,
      });
      return { success: true, message: `Generated hashtags for ${topic}`, data: hashtags };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const rewriteContentTool = tool({
  description: 'Rewrite content in brand voice',
  parameters: z.object({
    content: z.string().describe('Content to rewrite'),
    tone: z.string().optional().describe('Target tone'),
    platform: z.enum(['instagram', 'twitter', 'linkedin', 'tiktok', 'facebook']).optional().describe('Target platform'),
  }),
  execute: async ({ content, tone, platform }) => {
    try {
      const { generateText } = await import('ai');
      const { callWithProviderChain } = await import('../lib/llmProvider');
      const rewritten = await callWithProviderChain('content_generation',
        async (provider, modelId) => {
          const { text } = await generateText({
            model: provider.chat(modelId),
            prompt: `Rewrite this content in a ${tone || 'confident, engaging'} tone${platform ? ` for ${platform}` : ''}. Keep the core message but make it punchier:\n\n${content}`,
          });
          return text;
        }
      );
      return { success: true, message: 'Content rewritten', data: { content: rewritten } };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Analytics Tools                                                     */
/* ------------------------------------------------------------------ */

export const getAnalyticsTool = tool({
  description: 'Get analytics overview for your brand',
  parameters: z.object({
    days: z.number().optional().describe('Number of days to look back (default 30)'),
  }),
  execute: async ({ days }) => {
    try {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - (days || 30) * 86400000).toISOString();
      const snapshots = db.select().from(accountSnapshots).where(gte(accountSnapshots.snapshotDate, start)).all();
      const postsData = db.select().from(scheduledPosts).where(and(gte(scheduledPosts.scheduledAt, start), lte(scheduledPosts.scheduledAt, end))).all();
      return {
        success: true,
        message: `Analytics: ${snapshots.length} data points, ${postsData.length} posts`,
        navigationTarget: '/analytics',
        data: { snapshots, posts: postsData },
      };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const getTopContentTool = tool({
  description: 'Get top-performing content',
  parameters: z.object({
    limit: z.number().optional().describe('Number of top posts (default 5)'),
  }),
  execute: async ({ limit }) => {
    try {
      const posts = db.select().from(scheduledPosts).where(eq(scheduledPosts.status, 'published')).all().slice(0, limit || 5);
      return { success: true, message: `Top ${(limit || 5)} posts`, navigationTarget: '/analytics', data: posts };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Video Tools                                                         */
/* ------------------------------------------------------------------ */

export const createVideoTool = tool({
  description: 'Open Viral Studio to create a video (upload a file, detect viral moments, extract clips)',
  parameters: z.object({
    topic: z.string().optional().describe('Video topic or theme'),
  }),
  execute: async () => {
    return { success: true, message: 'Opening Viral Studio where you can upload a video and create viral clips', navigationTarget: '/viral' };
  },
});

export const listVideosTool = tool({
  description: 'List all generated videos',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { viralJobs } = await import('../db/schema');
      const all = db.select().from(viralJobs).all();
      return { success: true, message: `Found ${all.length} videos`, navigationTarget: '/viral', data: all };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Autopilot Tools                                                     */
/* ------------------------------------------------------------------ */

export const startAutopilotTool = tool({
  description: 'Start autonomous marketing autopilot',
  parameters: z.object({
    goal: z.string().describe('Marketing goal for autopilot'),
    audience: z.string().optional().describe('Target audience description'),
    channels: z.array(z.string()).optional().describe('Channels to operate on (instagram, twitter, linkedin)'),
    durationDays: z.number().optional().describe('Duration in days (default 14)'),
  }),
  execute: async ({ goal, audience, channels, durationDays }) => {
    try {
      const brand = getActiveBrand();
      if (!brand) return { success: false, message: 'No brand profile found. Create one first.' };
      const { startAutopilot } = await import('../agents/autopilotAgent');
      const result = await startAutopilot({
        brandProfileId: brand.id,
        audienceDescription: audience || brand.audience,
        primaryGoal: goal,
        goalType: 'growth',
        durationDays: durationDays || 14,
        channels: channels || ['instagram'],
      });
      return { success: true, message: 'Autopilot started! I\'ll handle your marketing autonomously.', navigationTarget: '/dashboard', data: { autopilotId: result.autopilotId } };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const stopAutopilotTool = tool({
  description: 'Stop active autopilot',
  parameters: z.object({
    autopilotId: z.string().describe('Autopilot session ID'),
  }),
  execute: async ({ autopilotId }) => {
    try {
      const { pauseAutopilot } = await import('../agents/autopilotAgent');
      await pauseAutopilot(autopilotId);
      return { success: true, message: 'Autopilot stopped', navigationTarget: '/dashboard' };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const getAutopilotStatusTool = tool({
  description: 'Get autopilot status',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { autopilotSessions } = await import('../db/schema');
      const active = db.select().from(autopilotSessions).where(eq(autopilotSessions.status, 'monitoring')).get();
      return { success: true, message: active ? 'Autopilot is running' : 'No active autopilot', navigationTarget: '/dashboard', data: active };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Web Search Tools                                                     */
/* ------------------------------------------------------------------ */

export const searchWebTool = tool({
  description: 'Search the web for current information, news, trends, or research',
  parameters: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Maximum results (default 5)'),
  }),
  execute: async ({ query, maxResults }) => {
    const results = await searchWeb(query, maxResults || 5);
    return { success: true, message: `Found ${results.length} results for "${query}"`, data: results };
  },
});

export const fetchUrlTool = tool({
  description: 'Fetch and summarize content from a URL',
  parameters: z.object({
    url: z.string().describe('URL to fetch'),
  }),
  execute: async ({ url }) => {
    const content = await fetchUrl(url);
    return { success: true, message: `Fetched ${url}`, data: { url, content } };
  },
});

/* ------------------------------------------------------------------ */
/*  Brand Tools                                                         */
/* ------------------------------------------------------------------ */

export const getBrandProfileTool = tool({
  description: 'Get current brand profile',
  parameters: z.object({}),
  execute: async () => {
    try {
      const brand = getActiveBrand();
      return { success: true, message: brand ? 'Brand profile loaded' : 'No brand profile', navigationTarget: '/brand-memory', data: brand };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const updateBrandProfileTool = tool({
  description: 'Update brand profile (name, industry, audience, voice)',
  parameters: z.object({
    name: z.string().optional().describe('Brand name'),
    industry: z.string().optional().describe('Industry'),
    audience: z.string().optional().describe('Target audience description'),
    voiceFingerprint: z.string().optional().describe('Brand voice description'),
  }),
  execute: async ({ name, industry, audience, voiceFingerprint }) => {
    try {
      const brand = getActiveBrand();
      if (!brand) return { success: false, message: 'No brand profile exists' };
      const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (name) updateData.name = name;
      if (industry) updateData.industry = industry;
      if (audience) updateData.audience = audience;
      if (voiceFingerprint) updateData.voiceFingerprint = voiceFingerprint;
      await db.update(brandProfiles).set(updateData).where(eq(brandProfiles.id, brand.id)).run();
      return { success: true, message: 'Brand profile updated', navigationTarget: '/brand-memory' };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const runBrandAuditTool = tool({
  description: 'Run a brand audit/roast analysis',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { roastBrand } = await import('../services/brandRoastService');
      const brand = getActiveBrand();
      if (!brand) return { success: false, message: 'No brand profile' };
      const roast = await roastBrand({ brandProfileId: brand.id });
      return { success: true, message: `Brand audit score: ${roast.overallScore}/100`, navigationTarget: '/brand-roast', data: roast };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Connector Tools                                                     */
/* ------------------------------------------------------------------ */

export const listConnectorsTool = tool({
  description: 'List all connected connectors',
  parameters: z.object({}),
  execute: async () => {
    try {
      const all = await registry.getAll();
      return { success: true, message: `Found ${all.length} connectors`, navigationTarget: '/connectors', data: all };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const testConnectorTool = tool({
  description: 'Test a connector connection',
  parameters: z.object({
    connectorId: z.string().describe('Connector ID'),
  }),
  execute: async ({ connectorId }) => {
    try {
      const apiKey = await credentialStore.getCredential(connectorId, 'apiKey');
      return { success: !!apiKey, message: apiKey ? 'Connector verified' : 'No credentials found', data: { connected: !!apiKey } };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Scheduling Tools                                                    */
/* ------------------------------------------------------------------ */

export const schedulePostTool = tool({
  description: 'Schedule a social media post',
  parameters: z.object({
    content: z.string().describe('Post content'),
    platform: z.enum(['instagram', 'twitter', 'linkedin', 'tiktok', 'facebook']).describe('Platform'),
    when: z.string().optional().describe('ISO date string or relative like "tomorrow 9am"'),
  }),
  execute: async ({ content, platform, when }) => {
    try {
      const { schedulePost: schedule } = await import('../services/schedulerService');
      const postId = crypto.randomUUID();
      const scheduledDate = when ? new Date(when) : new Date(Date.now() + 86400000);
      const now = new Date().toISOString();
      const brand = getActiveBrand();
      const brandProfileId = brand?.id || '';
      await db.insert(scheduledPosts).values({ id: postId, brandProfileId, content, platform, scheduledAt: scheduledDate.toISOString(), status: 'pending', createdAt: now, updatedAt: now });
      await schedule({ id: postId, brandProfileId, content, platform, scheduledAt: scheduledDate.toISOString() });
      return { success: true, message: `Post scheduled for ${platform}`, navigationTarget: '/scheduler', data: { postId, platform, scheduledAt: scheduledDate.toISOString() } };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const listScheduledPostsTool = tool({
  description: 'List scheduled posts',
  parameters: z.object({}),
  execute: async () => {
    try {
      const posts = db.select().from(scheduledPosts).orderBy(desc(scheduledPosts.scheduledAt)).all();
      return { success: true, message: `Found ${posts.length} scheduled posts`, navigationTarget: '/scheduler', data: posts };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const cancelScheduledPostTool = tool({
  description: 'Cancel a scheduled post',
  parameters: z.object({
    postId: z.string().describe('Post ID to cancel'),
  }),
  execute: async ({ postId }) => {
    try {
      await db.update(scheduledPosts).set({ status: 'cancelled', updatedAt: new Date().toISOString() }).where(eq(scheduledPosts.id, postId)).run();
      return { success: true, message: 'Post cancelled', navigationTarget: '/scheduler' };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Settings Tools                                                      */
/* ------------------------------------------------------------------ */

export const getSettingsTool = tool({
  description: 'Get app settings',
  parameters: z.object({}),
  execute: async () => {
    try {
      const settings = db.select().from(appSettings).all();
      return { success: true, message: 'Settings loaded', navigationTarget: '/settings', data: settings };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const updateSettingTool = tool({
  description: 'Update an app setting',
  parameters: z.object({
    key: z.string().describe('Setting key'),
    value: z.string().describe('Setting value'),
  }),
  execute: async ({ key, value }) => {
    try {
      const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
      if (existing) {
        await db.update(appSettings).set({ value, updatedAt: new Date().toISOString() }).where(eq(appSettings.key, key)).run();
      } else {
        await db.insert(appSettings).values({ key, value, updatedAt: new Date().toISOString() }).run();
      }
      return { success: true, message: `Setting ${key} updated` };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Navigation Tool                                                     */
/* ------------------------------------------------------------------ */

export const navigateTool = tool({
  description: 'Navigate to any page in VIMO instantly. ALWAYS use this after completing a task so the user can see the result.',
  parameters: z.object({
    page: z.string().describe('Page: dashboard, analytics, campaigns, scheduler, content, engagement, connectors, connector-hub, social-accounts, settings, brand-roast, brand-memory, intelligence, viral, approvals, library'),
  }),
  execute: async ({ page }) => {
    const pageMap: Record<string, string> = {
      dashboard: '/dashboard', analytics: '/analytics', campaigns: '/campaigns',
      scheduler: '/scheduler', content: '/content', engagement: '/engagement',
      connectors: '/connector-hub', 'connector-hub': '/connector-hub',
      'social-accounts': '/social-accounts', settings: '/settings',
      'brand-roast': '/brand-roast', 'brand-memory': '/brand-memory',
      intelligence: '/intelligence', viral: '/viral', 'viral studio': '/viral',
      approvals: '/approvals', library: '/library',
      'content library': '/library', 'media library': '/library',
    };
    const path = pageMap[page.toLowerCase()] || `/${page.toLowerCase().replace(/\s+/g, '-')}`;
    return { success: true, message: `Navigated to ${path}`, navigationTarget: path, data: { path } };
  },
});

/* ------------------------------------------------------------------ */
/*  Competitor/Trend Tools                                              */
/* ------------------------------------------------------------------ */

export const addCompetitorTool = tool({
  description: 'Add a competitor to track',
  parameters: z.object({
    name: z.string().describe('Competitor name'),
    handle: z.string().describe('Social media handle'),
    platform: z.string().optional().describe('Platform (instagram, twitter, etc.)'),
  }),
  execute: async ({ name, handle, platform }) => {
    try {
      const brand = getActiveBrand();
      if (!brand) return { success: false, message: 'No brand profile' };
      await db.insert(competitorProfiles).values({
        id: crypto.randomUUID(), brandProfileId: brand.id,
        competitorName: name, platformHandle: handle,
        platform: platform || 'instagram', followersCount: null,
        lastCheckedAt: null, createdAt: new Date().toISOString(),
      });
      return { success: true, message: `${name} added as competitor`, navigationTarget: '/intelligence' };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const listCompetitorsTool = tool({
  description: 'List tracked competitors',
  parameters: z.object({}),
  execute: async () => {
    try {
      const all = db.select().from(competitorProfiles).all();
      return { success: true, message: `Tracking ${all.length} competitors`, navigationTarget: '/intelligence', data: all };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const listTrendsTool = tool({
  description: 'List current trending topics and signals',
  parameters: z.object({}),
  execute: async () => {
    try {
      const signals = db.select().from(trendSignals).orderBy(desc(trendSignals.relevanceScore)).all().slice(0, 10);
      return { success: true, message: `Found ${signals.length} trends`, navigationTarget: '/intelligence', data: signals };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const listOpportunitiesTool = tool({
  description: 'List current marketing opportunities',
  parameters: z.object({}),
  execute: async () => {
    try {
      const opps = db.select().from(opportunities).where(eq(opportunities.isActedOn, 0)).all();
      return { success: true, message: `${opps.length} opportunities available`, navigationTarget: '/dashboard', data: opps };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Content Library Tool                                                */
/* ------------------------------------------------------------------ */

export const listContentLibraryTool = tool({
  description: 'Browse or search the content library for previously generated posts, images, and videos',
  parameters: z.object({
    type: z.string().optional().describe('Filter by type: social_post, image, video, ad_copy, email'),
    platform: z.string().optional().describe('Filter by platform: instagram, twitter, linkedin, tiktok, facebook'),
    status: z.string().optional().describe('Filter by status: draft, published, archived'),
    limit: z.number().optional().describe('Max results to return (default 10)'),
  }),
  execute: async ({ type, platform, status, limit }) => {
    try {
      const conditions: any[] = [];
      if (type) conditions.push(eq(contentLibrary.type, type));
      if (platform) conditions.push(eq(contentLibrary.platform, platform));
      if (status) conditions.push(eq(contentLibrary.status, status));
      const items = conditions.length > 0
        ? db.select().from(contentLibrary).where(and(...conditions)).orderBy(desc(contentLibrary.createdAt)).all().slice(0, limit || 10)
        : db.select().from(contentLibrary).orderBy(desc(contentLibrary.createdAt)).all().slice(0, limit || 10);
      return { success: true, message: `Found ${items.length} items in content library`, navigationTarget: '/library', data: items };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Skills Tools — discoverable procedures + the learning loop          */
/* ------------------------------------------------------------------ */

export const listSkillsTool = tool({
  description: 'List available skill playbooks (launch-post, pillar-plan, winner-repurpose, brand-roast-fix, weekly-review)',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { skillsCatalog } = await import('../skills/loader');
      const skills = skillsCatalog();
      return {
        success: true,
        message: skills.length > 0
          ? `Available skills: ${skills.map((s) => s.name).join(', ')}`
          : 'No skills installed',
        data: skills,
      };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const useSkillTool = tool({
  description: 'Load a skill playbook and follow it step by step with your other tools',
  parameters: z.object({
    name: z.string().describe('Skill name from list_skills (e.g. launch-post)'),
  }),
  execute: async ({ name }) => {
    try {
      const { getSkill } = await import('../skills/loader');
      const skill = getSkill(name);
      if (!skill) {
        const { skillsCatalog } = await import('../skills/loader');
        const available = skillsCatalog().map((s) => s.name).join(', ');
        return { success: false, message: `Unknown skill "${name}". Available: ${available || 'none'}` };
      }
      return { success: true, message: `Following skill: ${skill.name}`, data: { name: skill.name, instructions: skill.body } };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const saveLessonTool = tool({
  description: 'Save something learned about this brand so future runs remember it (what worked, what failed, audience patterns)',
  parameters: z.object({
    lesson: z.string().describe('The lesson in one or two sentences'),
    tags: z.string().optional().describe('Comma-separated tags, e.g. hooks,instagram,video'),
  }),
  execute: async ({ lesson, tags }) => {
    try {
      const brand = getActiveBrand();
      if (!brand) return { success: false, message: 'No brand profile found. Create one first.' };
      const { marketingMemory } = await import('../db/schema');
      const now = new Date().toISOString();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      await db.insert(marketingMemory).values({
        id: crypto.randomUUID(),
        brandProfileId: brand.id,
        entryType: 'lesson',
        entryDate: now.split('T')[0],
        weekLabel: weekStart.toISOString().split('T')[0],
        summary: lesson.slice(0, 2000),
        metrics: null,
        sentiment: 'neutral',
        tags: tags || 'skill,learning',
        linkedEntityId: null,
        linkedEntityType: 'skill',
        lessonsJson: null,
        createdAt: now,
      }).run();
      return { success: true, message: 'Lesson saved — future runs will remember this.' };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Sprint + Visual + Playbook Tools                                     */
/* ------------------------------------------------------------------ */

export const startSprintTool = tool({
  description: 'Launch a marketing sprint: specialists research trends, competitors and opportunities in parallel, then draft follow-up posts',
  parameters: z.object({
    goal: z.string().describe('The goal, e.g. "launch our summer sale"'),
    platforms: z.array(z.string()).optional().describe('Up to 3 platforms for drafts (default instagram, linkedin, x)'),
    maxDrafts: z.number().optional().describe('How many drafts to produce (1-5, default 3)'),
  }),
  execute: async ({ goal, platforms, maxDrafts }) => {
    try {
      const brand = getActiveBrand();
      if (!brand) return { success: false, message: 'No brand profile found. Create one first.' };
      const { runMarketingSprint } = await import('../services/marketingSprintService');
      const report = await runMarketingSprint({
        brandProfileId: brand.id,
        goal,
        platforms,
        maxDrafts,
      });
      const summary = `Sprint done in ${Math.round(report.durationMs / 1000)}s: ` +
        `${report.research.trends.length} trends, ${report.research.competitors.length} competitors tracked, ` +
        `${report.drafts.length} draft(s) ready for review` +
        (report.warnings.length > 0 ? ` (${report.warnings.length} warning(s), nothing lost)` : '');
      return { success: true, message: summary, navigationTarget: '/dashboard', data: report };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const generateImageTool = tool({
  description: 'Generate a brand-styled marketing visual (no generic AI slop — brand DNA, quality craft, platform sizing built in)',
  parameters: z.object({
    prompt: z.string().describe('What the image should show'),
    platform: z.string().optional().describe('Target platform for sizing (instagram, tiktok, linkedin, x, facebook, pinterest, youtube)'),
    style: z.enum(['authentic', 'minimal', 'bold']).optional().describe('Visual style (default authentic)'),
  }),
  execute: async ({ prompt, platform, style }) => {
    try {
      const brand = getActiveBrand();
      if (!brand) return { success: false, message: 'No brand profile found. Create one first.' };
      const { buildCreativePrompt } = await import('../services/creativeBriefService');
      const { generateImage } = await import('../services/imageGenerationService');
      const brief = buildCreativePrompt({
        brandProfileId: brand.id,
        prompt,
        platform: platform || 'instagram',
        style: style || 'authentic',
      });
      const result = await generateImage({
        prompt: brief.prompt,
        width: brief.width,
        height: brief.height,
      });
      const { contentLibrary } = await import('../db/schema');
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      await db.insert(contentLibrary).values({
        id,
        brandProfileId: brand.id,
        type: 'image',
        platform: platform || 'instagram',
        title: prompt.slice(0, 100),
        content: prompt,
        mediaUrl: result.url,
        mediaUrlsJson: null,
        metadataJson: JSON.stringify({ prompt: brief.prompt, style: brief.style, provider: result.provider }),
        status: 'draft',
        source: 'ai_generated',
        websiteContextJson: null,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      }).run();
      return {
        success: true,
        message: `Visual ready (${brief.width}x${brief.height}, ${brief.style} style). Saved to your library as a draft.`,
        navigationTarget: '/library',
        data: { id, url: result.url, provider: result.provider },
      };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

export const getPlaybookTool = tool({
  description: 'Get a proven CMO growth playbook (pillars, hooks, social search, winner loops, cadence, community)',
  parameters: z.object({
    topic: z.string().optional().describe('What you need: pillars, hooks, search, cta, winners, review, community, cadence, metrics, voice'),
  }),
  execute: async ({ topic }) => {
    try {
      const { getPlaybook, listPlaybooks } = await import('../services/cmoPlaybooks');
      if (!topic) {
        return { success: true, message: `Available playbooks: ${listPlaybooks().map((p) => p.id).join(', ')}`, data: listPlaybooks() };
      }
      const playbook = getPlaybook(topic);
      if (!playbook) {
        return { success: false, message: `No playbook matches "${topic}". Available: ${listPlaybooks().map((p) => p.id).join(', ')}` };
      }
      return { success: true, message: `${playbook.name}: ${playbook.promise}`, data: playbook };
    } catch (err) { return { success: false, message: `Failed: ${(err as Error).message}` }; }
  },
});

/* ------------------------------------------------------------------ */
/*  Registry of all tools                                              */
/* ------------------------------------------------------------------ */

export const assistantTools = {
  create_campaign: createCampaignTool,
  list_campaigns: listCampaignsTool,
  update_campaign: updateCampaignTool,
  write_post: writePostTool,
  generate_hashtags: generateHashtagsTool,
  rewrite_content: rewriteContentTool,
  get_analytics: getAnalyticsTool,
  get_top_content: getTopContentTool,
  create_video: createVideoTool,
  list_videos: listVideosTool,
  start_autopilot: startAutopilotTool,
  stop_autopilot: stopAutopilotTool,
  get_autopilot_status: getAutopilotStatusTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  get_brand_profile: getBrandProfileTool,
  update_brand_profile: updateBrandProfileTool,
  run_brand_audit: runBrandAuditTool,
  list_connectors: listConnectorsTool,
  test_connector: testConnectorTool,
  schedule_post: schedulePostTool,
  list_scheduled_posts: listScheduledPostsTool,
  cancel_scheduled_post: cancelScheduledPostTool,
  get_settings: getSettingsTool,
  update_setting: updateSettingTool,
  navigate: navigateTool,
  add_competitor: addCompetitorTool,
  list_competitors: listCompetitorsTool,
  list_trends: listTrendsTool,
  list_opportunities: listOpportunitiesTool,
  list_content_library: listContentLibraryTool,
  list_skills: listSkillsTool,
  use_skill: useSkillTool,
  save_lesson: saveLessonTool,
  start_sprint: startSprintTool,
  generate_image: generateImageTool,
  get_playbook: getPlaybookTool,
} as const;

export type ToolName = keyof typeof assistantTools;

const toolDescriptions: Record<string, string> = {
  create_campaign: 'Create a new marketing campaign with name, goal, channels, and duration',
  list_campaigns: 'List all campaigns',
  update_campaign: 'Update campaign status (draft, active, paused, completed) or name',
  write_post: 'Write a social media post on any platform using AI brand voice',
  generate_hashtags: 'Generate tiered hashtags for Instagram or TikTok',
  rewrite_content: 'Rewrite content in brand voice for any platform',
  get_analytics: 'Get analytics and performance data',
  get_top_content: 'Get top-performing published content',
  create_video: 'Create a viral video with Viral Studio',
  list_videos: 'List all generated videos',
  start_autopilot: 'Start autonomous marketing autopilot that handles everything',
  stop_autopilot: 'Stop an active autopilot session',
  get_autopilot_status: 'Check if autopilot is running',
  search_web: 'Search the web for current information and trends',
  fetch_url: 'Fetch and summarize content from any URL',
  get_brand_profile: 'Get the current brand profile details',
  update_brand_profile: 'Update brand name, industry, audience, or voice',
  run_brand_audit: 'Run a full brand audit/roast analysis',
  list_connectors: 'List all connected apps and platforms',
  test_connector: 'Test if a connector is working properly',
  schedule_post: 'Schedule a social media post',
  list_scheduled_posts: 'List all scheduled posts',
  cancel_scheduled_post: 'Cancel a scheduled post',
  get_settings: 'Get all app settings',
  update_setting: 'Update any app setting',
  navigate: 'Navigate to any page in VIMO',
  add_competitor: 'Add a competitor to track',
  list_competitors: 'List tracked competitors',
  list_trends: 'List trending topics and signals',
  list_opportunities: 'List current marketing opportunities',
  list_content_library: 'Browse or search the content library for saved posts, images, and videos',
  list_skills: 'List available skill playbooks the agent can follow',
  use_skill: 'Load a skill playbook and follow it step by step',
  save_lesson: 'Save something learned about this brand for future runs',
  start_sprint: 'Launch a parallel marketing sprint toward one goal',
  generate_image: 'Generate a brand-styled marketing visual',
  get_playbook: 'Get a proven CMO growth playbook',
};

export function getToolDescriptions(): string {
  return Object.entries(toolDescriptions)
    .map(([name, desc]) => `- ${name}: ${desc}`)
    .join('\n');
}
