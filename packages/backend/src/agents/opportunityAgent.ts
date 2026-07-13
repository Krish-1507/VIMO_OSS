/**
 * Opportunity Agent
 *
 * Scans Product Hunt and trending GitHub repositories for growth opportunities.
 * Identifies where the brand can create relevant content and establish thought leadership.
 */

import crypto from 'crypto';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { trendSignals, brandProfiles, agentLogs } from '../db/schema';
import { getActiveLLMProvider } from '../lib/llmProvider';
import { callLLMWithFallback } from '../lib/llmErrorHandler';
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
    agentType: 'opportunity',
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
/*  Scan Tasks                                                         */
/* ------------------------------------------------------------------ */

interface PHProduct {
  name: string;
  tagline: string;
}

async function fetchProductHunt(): Promise<PHProduct[]> {
  const products: PHProduct[] = [];
  try {
    const res = await axios.get('https://www.producthunt.com/feed', { timeout: 10000 });
    const parser = new XMLParser();
    const parsed = parser.parse(res.data);
    const items = parsed?.rss?.channel?.item ?? [];
    const topItems = Array.isArray(items) ? items.slice(0, 10) : [items].slice(0, 10);

    for (const item of topItems) {
      if (item.title) {
        // Product Hunt RSS often has format "Name: Tagline"
        const colonIndex = item.title.indexOf(':');
        if (colonIndex > 0) {
          products.push({
            name: item.title.substring(0, colonIndex).trim(),
            tagline: item.title.substring(colonIndex + 1).trim(),
          });
        } else {
          products.push({
            name: item.title,
            tagline: item.description || '',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[OpportunityAgent] Product Hunt fetch failed:', (err as Error).message);
  }
  return products;
}

interface GHRepo {
  name: string;
  description: string;
  stars: number;
}

async function fetchGitHubTrending(): Promise<GHRepo[]> {
  const repos: GHRepo[] = [];
  try {
    // Get yesterday's date for the GitHub API query
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const res = await axios.get(
      `https://api.github.com/search/repositories?q=created:>${yesterday}&sort=stars&order=desc&per_page=10`,
      {
        headers: { 'User-Agent': 'VIMO-OpportunityAgent/1.0' },
        timeout: 10000,
      }
    );

    const items = res.data?.items ?? [];
    for (const item of items.slice(0, 10)) {
      repos.push({
        name: item.full_name || item.name || '',
        description: item.description || '',
        stars: item.stargazers_count || 0,
      });
    }
  } catch (err) {
    console.warn('[OpportunityAgent] GitHub fetch failed:', (err as Error).message);
  }
  return repos;
}

/* ------------------------------------------------------------------ */
/*  Main Function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Scan for growth opportunities from Product Hunt and GitHub trending.
 * Calls the LLM to identify the best content opportunities for the brand.
 */
export async function scanOpportunities(brandProfileId: string): Promise<void> {
  const start = Date.now();
  console.log(`[OpportunityAgent] Starting opportunity scan for brand ${brandProfileId}...`);

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

    // Run two parallel scan tasks
    const [phResult, ghResult] = await Promise.allSettled([
      fetchProductHunt(),
      fetchGitHubTrending(),
    ]);

    const phProducts = phResult.status === 'fulfilled' ? phResult.value : [];
    const ghRepos = ghResult.status === 'fulfilled' ? ghResult.value : [];

    console.log(
      `[OpportunityAgent] Collected ${phProducts.length} Product Hunt products, ${ghRepos.length} GitHub repos`
    );

    if (phProducts.length === 0 && ghRepos.length === 0) {
      console.log('[OpportunityAgent] No sources returned data. Skipping LLM analysis.');
      await logAgentAction({
        action: 'scanOpportunities',
        input: JSON.stringify({ brandProfileId }),
        output: 'No data from sources',
        status: 'complete',
        durationMs: Date.now() - start,
      });
      return;
    }

    // Call the LLM to identify opportunities
    const { provider, modelId } = await getActiveLLMProvider('opportunity analysis');

    const phFormatted = phProducts
      .map((p) => `${p.name}: ${p.tagline}`)
      .join('\n');
    const ghFormatted = ghRepos
      .map((r) => `${r.name} (${r.stars} stars): ${r.description}`)
      .join('\n');

    const prompt = `You are a growth opportunity analyst. A brand in ${industry} targeting ${audience} wants to find content opportunities.

Here are today's trending products on Product Hunt:
${phFormatted}

Here are today's fastest-growing GitHub repositories:
${ghFormatted}

Identify up to 3 opportunities where this brand could create relevant content and establish thought leadership within the next 24 hours.

Return JSON array with:
  opportunity (string),
  relevanceScore (integer),
  urgency (string — 'post_today' or 'post_this_week'),
  suggestedAngle (string — specific content angle for this brand),
  estimatedReach (string — 'low', 'medium', or 'high')`;

    const text = await callLLMWithFallback(
      async () => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        return t;
      },
      () => {
        const item = phProducts[0] || ghRepos[0];
        const itemName = item ? (typeof item === 'string' ? item : (item as any).name || 'New trend') : 'New trend';
        return JSON.stringify([
          {
            opportunity: `Create content about '${itemName}' from the perspective of ${industry}`,
            relevanceScore: 50,
            urgency: 'post_this_week',
            suggestedAngle: `Analyze how ${itemName} impacts the ${industry} industry and what it means for your audience.`,
            estimatedReach: 'medium',
          },
        ]);
      },
      'opportunity analysis'
    );

    const parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
    const opportunities = Array.isArray(parsed) ? parsed : (parsed.opportunities || parsed.results || []);

    // Insert qualifying signals
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    let insertedCount = 0;

    for (const opp of opportunities) {
      if (opp.relevanceScore && opp.relevanceScore > 0 && opp.opportunity) {
        try {
          await db.insert(trendSignals).values({
            id: crypto.randomUUID(),
            signalType: 'growth_opportunity',
            title: opp.opportunity,
            description: opp.suggestedAngle || '',
            sourceUrl: null,
            relevanceScore: Math.min(100, Math.max(0, opp.relevanceScore)),
            actionSuggestion: `Urgency: ${opp.urgency || 'post_this_week'}. Estimated reach: ${opp.estimatedReach || 'medium'}. ${opp.suggestedAngle || ''}`,
            isActedOn: 0,
            expiresAt,
            createdAt: now,
          });
          insertedCount++;
        } catch (err) {
          console.warn('[OpportunityAgent] Failed to insert signal:', (err as Error).message);
        }
      }
    }

    // Emit socket event
    io.emit('opportunities:found', { count: insertedCount });

    console.log(`[OpportunityAgent] Inserted ${insertedCount} new opportunity signals.`);

    await logAgentAction({
      action: 'scanOpportunities',
      input: JSON.stringify({ brandProfileId }),
      output: `Found ${opportunities.length} opportunities, inserted ${insertedCount}`,
      status: 'complete',
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OpportunityAgent] Error:`, msg);
    await logAgentAction({
      action: 'scanOpportunities',
      input: JSON.stringify({ brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
  }
}
