/**
 * Marketing Sprint — the "swarm" behind one user goal.
 *
 * A sprint fans a goal out to the specialized workers in parallel (trend
 * hunting, competitor analysis, opportunity scanning), snapshots analytics,
 * and drafts follow-up posts — then hands ONE report back to the agent,
 * which presents it and proposes next steps. Drafts only: nothing here
 * schedules or publishes, so a sprint can never spend the user's trust.
 *
 * Every worker is individually guarded: one slow or failing agent degrades
 * into a warning instead of sinking the sprint (this is what keeps the
 * pipeline deterministic in keyless/offline environments).
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import {
  brandProfiles,
  trendSignals,
  competitorProfiles,
  accountSnapshots,
  scheduledPosts,
} from '../db/schema';
import { createLogger } from '../lib/logger';

const log = createLogger('sprint');

export interface SprintDraft {
  platform: string;
  topic: string;
  text: string;
  hashtags: string[];
}

export interface SprintReport {
  goal: string;
  brandProfileId: string;
  brandName: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  research: {
    trends: string[];
    competitors: string[];
    opportunities: string[];
  };
  analytics: {
    totalPosts: number;
    latestFollowers: number;
  };
  drafts: SprintDraft[];
  warnings: string[];
}

const DEFAULT_PLATFORMS = ['instagram', 'linkedin', 'x'];

async function runWorker(label: string, warnings: string[], fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = `${label} skipped: ${(err as Error).message}`;
    log.warn(msg);
    warnings.push(msg);
  }
}

export async function runMarketingSprint(params: {
  brandProfileId: string;
  goal: string;
  platforms?: string[];
  maxDrafts?: number;
}): Promise<SprintReport> {
  const startedAt = Date.now();
  const brandProfileId = params.brandProfileId;
  const goal = params.goal.trim();
  if (!goal) throw new Error('A sprint needs a goal — e.g. "launch our summer sale".');
  const platforms = (params.platforms || []).filter(Boolean).slice(0, 3);
  const targets = platforms.length > 0 ? platforms : [...DEFAULT_PLATFORMS];
  const maxDrafts = Math.min(Math.max(params.maxDrafts || 3, 1), 5);
  const warnings: string[] = [];

  const brand = db.select().from(brandProfiles).where(eq(brandProfiles.id, brandProfileId)).get();
  if (!brand) throw new Error('Brand profile not found. Create one first.');

  // 1) Fan out to the specialist workers in parallel.
  const { huntTrends } = await import('../agents/trendHunterAgent');
  const { analyzeCompetitors } = await import('../agents/competitorAgent');
  const { scanOpportunities } = await import('../agents/opportunityAgent');
  await Promise.allSettled([
    runWorker('Trend hunt', warnings, () => huntTrends(brandProfileId)),
    runWorker('Competitor analysis', warnings, () => analyzeCompetitors(brandProfileId)),
    runWorker('Opportunity scan', warnings, () => scanOpportunities(brandProfileId)),
  ]);

  // 2) Collect what the workers found.
  const trends = db
    .select({ title: trendSignals.title })
    .from(trendSignals)
    .orderBy(desc(trendSignals.relevanceScore))
    .all()
    .slice(0, 5)
    .map((t) => t.title);
  const competitors = db
    .select({ name: competitorProfiles.competitorName })
    .from(competitorProfiles)
    .where(eq(competitorProfiles.brandProfileId, brandProfileId))
    .all()
    .map((c) => c.name);
  const snapshots = db.select().from(accountSnapshots).all();
  const latestFollowers = snapshots.length > 0 ? snapshots[snapshots.length - 1].followersCount : 0;
  const totalPosts = db
    .select({ id: scheduledPosts.id })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.brandProfileId, brandProfileId))
    .all().length;

  // 3) Draft follow-ups grounded in the freshest signal (or the raw goal).
  const topics = trends.length > 0 ? trends.slice(0, maxDrafts) : [goal];
  const { generatePost } = await import('./contentGenerationService');
  const drafts: SprintDraft[] = [];
  for (let i = 0; i < Math.min(topics.length, maxDrafts); i++) {
    const platform = targets[i % targets.length];
    try {
      const post = await generatePost({ brandProfileId, platform, topic: topics[i] });
      drafts.push({ platform, topic: topics[i], text: post.content, hashtags: post.hashtags || [] });
    } catch (err) {
      const msg = `Draft ${i + 1} skipped: ${(err as Error).message}`;
      log.warn(msg);
      warnings.push(msg);
    }
  }

  const completedAt = Date.now();
  return {
    goal,
    brandProfileId,
    brandName: brand.name,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs: completedAt - startedAt,
    research: {
      trends,
      competitors,
      opportunities: trends.slice(0, 3).map((t) => `Angle on "${t}" for ${brand.name}`),
    },
    analytics: { totalPosts, latestFollowers },
    drafts,
    warnings,
  };
}
