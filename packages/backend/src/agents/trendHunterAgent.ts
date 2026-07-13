/**
 * Trend Hunter Agent
 *
 * Discovers trending topics across the internet (Reddit, Google Trends, Hacker News)
 * and determines whether VIMO's brand should create content around those trends.
 */

import crypto from 'crypto';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { trendSignals, brandProfiles, agentLogs } from '../db/schema';
import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';
import { io } from '../index';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function logAgentAction(params: {
  action: string;
  input: string;
  output: string;
  status: string;
  durationMs: number;
}) {
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    agentType: 'trend_hunter',
    action: params.action,
    input: params.input,
    output: params.output,
    connectorsCalled: '',
    status: params.status,
    durationMs: params.durationMs,
    createdAt: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/*  Discovery Tasks                                                    */
/* ------------------------------------------------------------------ */

async function fetchRedditHotPosts(): Promise<string[]> {
  const titles: string[] = [];
  try {
    const res = await axios.get(
      'https://www.reddit.com/r/entrepreneur+marketing+socialmedia+artificial+startups.json?sort=hot&limit=25',
      {
        headers: { 'User-Agent': 'VIMO-TrendHunter/1.0' },
        timeout: 10000,
      }
    );
    const posts = res.data?.data?.children ?? [];
    for (const child of posts) {
      const post = child?.data;
      if (post && post.ups > 100 && post.title) {
        titles.push(post.title);
      }
    }
  } catch (err) {
    console.warn('[TrendHunter] Reddit fetch failed:', (err as Error).message);
  }
  return titles;
}

async function fetchGoogleTrends(): Promise<string[]> {
  const trends: string[] = [];
  try {
    const res = await axios.get('https://trends.google.com/trending/rss?geo=US', {
      timeout: 10000,
    });
    const parser = new XMLParser();
    const parsed = parser.parse(res.data);
    const items = parsed?.rss?.channel?.item ?? [];
    const topItems = Array.isArray(items) ? items.slice(0, 10) : [items].slice(0, 10);
    for (const item of topItems) {
      if (item.title) {
        trends.push(item.title);
      }
    }
  } catch (err) {
    console.warn('[TrendHunter] Google Trends fetch failed:', (err as Error).message);
  }
  return trends;
}

async function fetchHackerNewsTop(): Promise<string[]> {
  const titles: string[] = [];
  try {
    // Get top stories IDs
    const idsRes = await axios.get(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { timeout: 10000 }
    );
    const ids: number[] = (idsRes.data ?? []).slice(0, 15);

    // Fetch each story's title
    const storyPromises = ids.map(async (id: number) => {
      try {
        const storyRes = await axios.get(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { timeout: 5000 }
        );
        return storyRes.data?.title ?? '';
      } catch {
        return '';
      }
    });

    const results = await Promise.all(storyPromises);
    for (const title of results) {
      if (title) titles.push(title);
    }
  } catch (err) {
    console.warn('[TrendHunter] Hacker News fetch failed:', (err as Error).message);
  }
  return titles;
}

/* ------------------------------------------------------------------ */
/*  Main Function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Hunt for trending topics relevant to the brand.
 * Runs three parallel discovery tasks, then uses the LLM to filter and rank results.
 */
export async function huntTrends(brandProfileId: string): Promise<void> {
  const start = Date.now();
  console.log(`[TrendHunter] Starting trend hunt for brand ${brandProfileId}...`);

  try {
    const brandRow = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, brandProfileId))
      .get();

    if (!brandRow) {
      throw new Error(`Brand profile ${brandProfileId} not found`);
    }

    const industry = brandRow.industry;
    const audience = brandRow.audience;
    const toneKeywords = brandRow.toneKeywordsJson || '[]';

    // Run three parallel discovery tasks
    const [redditResult, googleResult, hnResult] = await Promise.allSettled([
      fetchRedditHotPosts(),
      fetchGoogleTrends(),
      fetchHackerNewsTop(),
    ]);

    const redditTitles = redditResult.status === 'fulfilled' ? redditResult.value : [];
    const googleTrends = googleResult.status === 'fulfilled' ? googleResult.value : [];
    const hnTitles = hnResult.status === 'fulfilled' ? hnResult.value : [];

    console.log(
      `[TrendHunter] Collected ${redditTitles.length} Reddit posts, ${googleTrends.length} Google trends, ${hnTitles.length} HN stories`
    );

    if (redditTitles.length === 0 && googleTrends.length === 0 && hnTitles.length === 0) {
      console.log('[TrendHunter] No signals collected from any source. Skipping LLM analysis.');
      await logAgentAction({
        action: 'huntTrends',
        input: JSON.stringify({ brandProfileId }),
        output: 'No signals collected',
        status: 'complete',
        durationMs: Date.now() - start,
      });
      return;
    }

    // Call the LLM to analyze relevance
    const prompt = `You are a marketing trend analyst for a brand in the ${industry} industry.
Their audience is ${audience}.
Their brand voice is ${toneKeywords}.

Here are currently trending topics across the internet:
Reddit hot posts: ${JSON.stringify(redditTitles)}
Google trending searches: ${JSON.stringify(googleTrends)}
Hacker News top stories: ${JSON.stringify(hnTitles)}

Your job: identify which of these trends are relevant to this specific brand and would be worth creating content around within the next 24 hours.

Return a JSON array of up to 5 objects, each with:
  title (string — the trend),
  relevanceScore (integer 0 to 100),
  reasoning (string — one sentence why this is relevant to the brand),
  urgency (enum: post_today, post_this_week, monitor),
  contentIdea (string — a specific content idea for this brand around this trend)

Only include trends with relevanceScore above 40.`;

    const text = await callWithProviderChain(
      'trend analysis',
      async (provider, modelId) => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        return t;
      },
      () => {
        // Fallback: generate a generic signal if LLM fails
        return JSON.stringify([
          {
            title: redditTitles[0] || googleTrends[0] || hnTitles[0] || 'Trending topic in your industry',
            relevanceScore: 50,
            reasoning: 'This topic is relevant to your industry and audience.',
            urgency: 'post_this_week',
            contentIdea: `Create a post discussing this trending topic from your brand's unique perspective in the ${industry} space.`,
          },
        ]);
      },
    );

    const parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
    const signals = Array.isArray(parsed) ? parsed : (parsed.signals || parsed.results || []);

    // Insert qualifying signals into trend_signals
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    let insertedCount = 0;

    for (const signal of signals) {
      if (signal.relevanceScore && signal.relevanceScore > 40 && signal.title) {
        try {
          await db.insert(trendSignals).values({
            id: crypto.randomUUID(),
            signalType: 'trending_topic',
            title: signal.title,
            description: signal.reasoning || '',
            sourceUrl: null,
            relevanceScore: Math.min(100, Math.max(0, signal.relevanceScore)),
            actionSuggestion: `urgency: ${signal.urgency || 'post_this_week'}. Content idea: ${signal.contentIdea || ''}`,
            isActedOn: 0,
            expiresAt,
            createdAt: now,
          });
          insertedCount++;
        } catch (err) {
          console.warn('[TrendHunter] Failed to insert signal:', (err as Error).message);
        }
      }
    }

    // Emit socket event
    io.emit('trends:new_signals', { count: insertedCount });

    console.log(`[TrendHunter] Inserted ${insertedCount} new trend signals.`);

    await logAgentAction({
      action: 'huntTrends',
      input: JSON.stringify({ brandProfileId }),
      output: `Found ${signals.length} relevant trends, inserted ${insertedCount}`,
      status: 'complete',
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[TrendHunter] Error:`, msg);
    await logAgentAction({
      action: 'huntTrends',
      input: JSON.stringify({ brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
  }
}
