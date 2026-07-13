/**
 * Competitor Agent
 *
 * Tracks competitor accounts, refreshes their public data, analyzes their content
 * strategy using the LLM, and surfaces competitive intelligence for the brand.
 */

import crypto from 'crypto';
import axios from 'axios';
import { generateText } from 'ai';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { competitorProfiles, competitorSnapshots, trendSignals, brandProfiles, agentLogs } from '../db/schema';
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
    agentType: 'competitor',
    action: params.action,
    input: params.input,
    output: params.output,
    connectorsCalled: '',
    status: params.status,
    durationMs: params.durationMs,
    createdAt: new Date().toISOString(),
  });
}

interface InstagramProfileData {
  followersCount: number | null;
  recentPosts: string[];
}

async function fetchInstagramProfile(handle: string): Promise<InstagramProfileData> {
  try {
    const res = await axios.get(
      `https://www.instagram.com/${handle}/?__a=1&__d=dis`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      }
    );

    const user = res.data?.graphql?.user;
    if (user) {
      const followersCount = user.edge_followed_by?.count ?? null;
      const recentPosts: string[] = [];
      const edges = user.edge_owner_to_timeline_media?.edges ?? [];
      for (const edge of edges.slice(0, 10)) {
        const node = edge?.node;
        if (node?.edge_media_to_caption?.edges?.[0]?.node?.text) {
          recentPosts.push(node.edge_media_to_caption.edges[0].node.text);
        } else if (node?.accessibility_caption) {
          recentPosts.push(node.accessibility_caption);
        }
      }
      return { followersCount, recentPosts };
    }
    throw new Error('Could not parse Instagram profile data');
  } catch (err) {
    console.warn(`[CompetitorAgent] Instagram fetch failed for ${handle}:`, (err as Error).message);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Analyze all competitors for a brand.
 * For each competitor, fetches public data (if available), calls the LLM for
 * strategic insights, stores a snapshot, and surfaces interesting moves.
 */
export async function analyzeCompetitors(brandProfileId: string): Promise<void> {
  const start = Date.now();
  console.log(`[CompetitorAgent] Starting competitor analysis for brand ${brandProfileId}...`);

  try {
    const brandRow = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.id, brandProfileId))
      .get();

    if (!brandRow) {
      throw new Error(`Brand profile ${brandProfileId} not found`);
    }

    const competitors = await db
      .select()
      .from(competitorProfiles)
      .where(eq(competitorProfiles.brandProfileId, brandProfileId))
      .all();

    if (competitors.length === 0) {
      console.log('[CompetitorAgent] No competitors tracked for this brand.');
      await logAgentAction({
        action: 'analyzeCompetitors',
        input: JSON.stringify({ brandProfileId }),
        output: 'No competitors to analyze',
        status: 'complete',
        durationMs: Date.now() - start,
      });
      return;
    }

    const { provider, modelId } = await getActiveLLMProvider('competitor analysis');
    const now = new Date().toISOString();
    let analyzedCount = 0;

    for (const competitor of competitors) {
      try {
        let followersCount: number | null = competitor.followersCount;
        let recentPostThemes: string[] = [];
        let dataRefreshed = false;

        // Attempt to fetch fresh Instagram data
        if (competitor.platform === 'instagram') {
          try {
            const profileData = await fetchInstagramProfile(competitor.platformHandle);
            followersCount = profileData.followersCount;
            recentPostThemes = profileData.recentPosts;
            dataRefreshed = true;
          } catch {
            console.log(
              `[CompetitorAgent] Competitor data refresh failed for ${competitor.platformHandle} — using cached data.`
            );
            // Use cached data - keep existing followersCount
          }
        }

        // Get last snapshot for comparison (if any)
        const lastSnapshot = db
          .select()
          .from(competitorSnapshots)
          .where(eq(competitorSnapshots.competitorProfileId, competitor.id))
          .orderBy(desc(competitorSnapshots.createdAt))
          .all()[0];

        const themes =
          recentPostThemes.length > 0
            ? recentPostThemes.join(' | ')
            : lastSnapshot?.topContentTheme || 'No recent data';

        // Call LLM for strategic analysis
        const prompt = `Analyze this competitor's recent activity and identify strategic insights.

Competitor: ${competitor.competitorName}
Followers: ${followersCount ?? 'unknown'}
Their recent post themes based on data: ${themes}
Our brand: ${brandRow.name} in ${brandRow.industry}

Return JSON:
  topContentTheme (string),
  estimatedAvgEngagement (number),
  strategicInsight (string — one specific actionable insight for our brand based on their activity),
  counterPositioningOpportunity (string — one specific thing we could do that they are NOT doing)`;

        const text = await callLLMWithFallback(
          async () => {
            const { text: t } = await generateText({
              model: provider.chat(modelId),
              prompt,
            });
            return t;
          },
          () => {
            return JSON.stringify({
              topContentTheme: themes.substring(0, 100),
              estimatedAvgEngagement: 50,
              strategicInsight: 'Continue monitoring this competitor for content patterns and engagement strategies.',
              counterPositioningOpportunity: 'Focus on building deeper community engagement that competitors may be neglecting.',
            });
          },
          'competitor analysis'
        );

        const analysis = JSON.parse(
          text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '')
        );

        // Insert snapshot
        const snapshotId = crypto.randomUUID();
        await db.insert(competitorSnapshots).values({
          id: snapshotId,
          competitorProfileId: competitor.id,
          followersCount: followersCount ?? 0,
          postsThisWeek: recentPostThemes.length,
          topContentTheme: analysis.topContentTheme || themes.substring(0, 200),
          avgEngagementRate: analysis.estimatedAvgEngagement || 0,
          snapshotDate: now,
          createdAt: now,
        });

        // Update competitor's lastCheckedAt and followers
        await db
          .update(competitorProfiles)
          .set({
            followersCount,
            lastCheckedAt: now,
          })
          .where(eq(competitorProfiles.id, competitor.id))
          .run();

        // If follower growth exceeds 500 since last snapshot, create a signal
        if (lastSnapshot && followersCount !== null && lastSnapshot.followersCount !== null) {
          const followerGrowth = followersCount - lastSnapshot.followersCount;
          if (followerGrowth > 500) {
            const signalId = crypto.randomUUID();
            await db.insert(trendSignals).values({
              id: signalId,
              signalType: 'competitor_move',
              title: `${competitor.competitorName} gained ${followerGrowth}+ followers`,
              description: `${competitor.competitorName} on ${competitor.platform} gained ${followerGrowth} followers since last check. Strategic insight: ${analysis.strategicInsight || 'Rapid growth detected.'}`,
              sourceUrl: null,
              relevanceScore: Math.min(100, Math.floor(followerGrowth / 10)),
              actionSuggestion: `Review ${competitor.competitorName}'s recent content strategy — they are growing rapidly. Consider: ${analysis.counterPositioningOpportunity || 'Analyze their top-performing content themes.'}`,
              isActedOn: 0,
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
              createdAt: now,
            });
          }
        }

        analyzedCount++;
        console.log(`[CompetitorAgent] Analyzed competitor: ${competitor.competitorName}`);
      } catch (competitorErr) {
        console.warn(
          `[CompetitorAgent] Failed to analyze ${competitor.competitorName}:`,
          (competitorErr as Error).message
        );
      }
    }

    // Emit socket event
    io.emit('competitors:analyzed', {
      brandProfileId,
      analyzedCount,
    });

    console.log(`[CompetitorAgent] Analyzed ${analyzedCount}/${competitors.length} competitors.`);

    await logAgentAction({
      action: 'analyzeCompetitors',
      input: JSON.stringify({ brandProfileId }),
      output: `Analyzed ${analyzedCount}/${competitors.length} competitors`,
      status: 'complete',
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[CompetitorAgent] Error:`, msg);
    await logAgentAction({
      action: 'analyzeCompetitors',
      input: JSON.stringify({ brandProfileId }),
      output: msg,
      status: 'error',
      durationMs: Date.now() - start,
    });
  }
}
