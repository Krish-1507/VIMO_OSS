/**
 * Marketing Memory Timeline Service
 *
 * Permanent chronological record of everything that has happened to a brand's marketing.
 * Provides recording, querying, weekly grouping, LLM context injection, and insight generation.
 */

import crypto from 'crypto';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { marketingMemory, accountSnapshots, scheduledPosts, brandProfiles } from '../db/schema';
import { callWithProviderChain } from '../lib/llmProvider';
import { generateText } from 'ai';
import { sanitizeUserInput } from '../lib/promptSanitizer';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type MemoryEntryType =
  | 'post_published'
  | 'campaign_started'
  | 'campaign_completed'
  | 'follower_milestone'
  | 'engagement_spike'
  | 'trend_capitalized'
  | 'lesson_learned'
  | 'strategy_shift'
  | 'director_insight';

export type MemorySentiment = 'positive' | 'neutral' | 'negative';

export interface MemoryEntry {
  id: string;
  brandProfileId: string;
  entryType: MemoryEntryType;
  entryDate: string;
  weekLabel: string;
  summary: string;
  metrics: Record<string, unknown> | null;
  sentiment: MemorySentiment;
  tags: string[] | null;
  linkedEntityId: string | null;
  linkedEntityType: string | null;
  lessonsJson: string[] | null;
  createdAt: string;
}

export interface WeeklyGroup {
  weekLabel: string;
  startDate: string;
  entries: MemoryEntry[];
  weekSummary: string;
  netFollowerChange: number;
  avgEngagementRate: number;
  postCount: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getWeekLabel(date: Date): string {
  // Get the Monday of the current week
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const month = monday.toLocaleString('en-US', { month: 'long' });
  const dayNum = monday.getDate();
  const year = monday.getFullYear();
  return `Week of ${month} ${dayNum}, ${year}`;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function determineSentiment(entryType: MemoryEntryType, metrics?: Record<string, unknown> | null): MemorySentiment {
  if (entryType === 'follower_milestone' || entryType === 'trend_capitalized') return 'positive';
  if (entryType === 'campaign_started') return 'neutral';
  if (entryType === 'campaign_completed') {
    const rate = (metrics?.avgEngagementRate as number) || 0;
    return rate > 3 ? 'positive' : rate > 1 ? 'neutral' : 'negative';
  }
  if (entryType === 'post_published') return 'positive';
  if (entryType === 'lesson_learned') return 'neutral';
  if (entryType === 'director_insight') return 'neutral';
  if (entryType === 'strategy_shift') return 'neutral';
  if (entryType === 'engagement_spike') return 'positive';
  return 'neutral';
}

/* ------------------------------------------------------------------ */
/*  Core Functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Write path — every part of the system calls this to write to the timeline.
 */
export async function recordMemoryEntry(
  entry: Omit<MemoryEntry, 'id' | 'createdAt'>
): Promise<void> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.insert(marketingMemory).values({
    id,
    brandProfileId: entry.brandProfileId,
    entryType: entry.entryType,
    entryDate: entry.entryDate,
    weekLabel: entry.weekLabel,
    summary: entry.summary,
    metrics: entry.metrics ? JSON.stringify(entry.metrics) : null,
    sentiment: entry.sentiment || determineSentiment(entry.entryType, entry.metrics),
    tags: entry.tags ? JSON.stringify(entry.tags) : null,
    linkedEntityId: entry.linkedEntityId || null,
    linkedEntityType: entry.linkedEntityType || null,
    lessonsJson: entry.lessonsJson ? JSON.stringify(entry.lessonsJson) : null,
    createdAt: now,
  });
}

/**
 * Query the timeline with filters.
 */
export async function getTimeline(params: {
  brandProfileId: string;
  limit?: number;
  entryTypes?: MemoryEntryType[];
  fromDate?: string;
  toDate?: string;
}): Promise<MemoryEntry[]> {
  const { brandProfileId, limit = 100, entryTypes, fromDate, toDate } = params;
  const conditions = [eq(marketingMemory.brandProfileId, brandProfileId)];

  if (fromDate) {
    conditions.push(gte(marketingMemory.entryDate, fromDate));
  }
  if (toDate) {
    conditions.push(lte(marketingMemory.entryDate, toDate));
  }

  let rows = db
    .select()
    .from(marketingMemory)
    .where(and(...conditions))
    .orderBy(desc(marketingMemory.entryDate))
    .limit(limit)
    .all();

  if (entryTypes && entryTypes.length > 0) {
    rows = rows.filter((r) => entryTypes.includes(r.entryType as MemoryEntryType));
  }

  return rows.map((r) => ({
    id: r.id,
    brandProfileId: r.brandProfileId,
    entryType: r.entryType as MemoryEntryType,
    entryDate: r.entryDate,
    weekLabel: r.weekLabel,
    summary: r.summary,
    metrics: r.metrics ? JSON.parse(r.metrics) : null,
    sentiment: r.sentiment as MemorySentiment,
    tags: r.tags ? JSON.parse(r.tags) : null,
    linkedEntityId: r.linkedEntityId,
    linkedEntityType: r.linkedEntityType,
    lessonsJson: r.lessonsJson ? JSON.parse(r.lessonsJson) : null,
    createdAt: r.createdAt,
  }));
}

/**
 * Get timeline grouped by week with computed summaries and stats.
 */
export async function getWeeklyGroupedTimeline(
  brandProfileId: string,
  weeksBack: number = 12
): Promise<WeeklyGroup[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - weeksBack * 7);
  const cutoffStr = cutoffDate.toISOString();

  // Get all memory entries for the period
  const entries = await getTimeline({
    brandProfileId,
    limit: 500,
    fromDate: cutoffStr,
  });

  // Get account snapshots for follower change
  const snapshots = db
    .select()
    .from(accountSnapshots)
    .where(gte(accountSnapshots.snapshotDate, cutoffStr.split('T')[0]))
    .orderBy(accountSnapshots.snapshotDate)
    .all();

  // Get published posts for engagement rates
  const posts = db
    .select()
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.brandProfileId, brandProfileId),
        eq(scheduledPosts.status, 'published'),
        gte(scheduledPosts.scheduledAt, cutoffStr),
      )
    )
    .all();

  // Group entries by week
  const weekGroups = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    const key = entry.weekLabel;
    if (!weekGroups.has(key)) weekGroups.set(key, []);
    weekGroups.get(key)!.push(entry);
  }

  // Build WeeklyGroup array
  const weeklyGroups: WeeklyGroup[] = [];
  const weekLabels = Array.from(weekGroups.keys()).sort();

  for (const weekLabel of weekLabels) {
    const weekEntries = weekGroups.get(weekLabel)!;
    const entryDates = weekEntries.map((e) => new Date(e.entryDate));
    const earliestDate = new Date(Math.min(...entryDates.map((d) => d.getTime())));

    // Calculate week start date
    const weekStart = getWeekStart(earliestDate);

    // Follower change: compare snapshot before week vs end of week
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekEnd);
    const snapBefore = snapshots.filter((s) => new Date(s.snapshotDate) < weekStartDate);
    const snapDuring = snapshots.filter(
      (s) => new Date(s.snapshotDate) >= weekStartDate && new Date(s.snapshotDate) < weekEndDate,
    );

    const followersBefore = snapBefore.length > 0 ? snapBefore[snapBefore.length - 1].followersCount : 0;
    const followersAfter = snapDuring.length > 0 ? snapDuring[snapDuring.length - 1].followersCount : followersBefore;
    const netFollowerChange = followersAfter - followersBefore;

    // Posts this week
    const weekPosts = posts.filter((p) => {
      const d = new Date(p.scheduledAt);
      return d >= new Date(weekStart) && d < weekEnd;
    });

    let totalEngagementRate = 0;
    for (const p of weekPosts) {
      const meta = p.metadataJson ? JSON.parse(p.metadataJson) : {};
      const perf = meta.performance || {};
      totalEngagementRate += perf.engagementRate || 0;
    }
    const avgEngagementRate = weekPosts.length > 0
      ? Math.round((totalEngagementRate / weekPosts.length) * 100) / 100
      : 0;

    // Compute week summary from entries
    const positiveCount = weekEntries.filter((e) => e.sentiment === 'positive').length;
    const negativeCount = weekEntries.filter((e) => e.sentiment === 'negative').length;
    const postPubCount = weekEntries.filter((e) => e.entryType === 'post_published').length;

    let weekSummary = '';
    if (postPubCount > 0 && netFollowerChange > 0) {
      weekSummary = `Posted ${postPubCount} times, gained ${netFollowerChange} followers. Positive momentum.`;
    } else if (postPubCount > 0 && netFollowerChange <= 0) {
      weekSummary = `Posted ${postPubCount} times but follower growth was flat or negative.`;
    } else if (postPubCount === 0) {
      weekSummary = 'No content was published this week.';
    } else {
      weekSummary = `${weekEntries.length} events recorded, ${positiveCount} positive, ${negativeCount} negative.`;
    }

    weeklyGroups.push({
      weekLabel,
      startDate: weekStart,
      entries: weekEntries,
      weekSummary,
      netFollowerChange,
      avgEngagementRate,
      postCount: weekPosts.length,
    });
  }

  // Sort oldest first
  weeklyGroups.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return weeklyGroups;
}

/**
 * Get formatted memory context string for LLM prompt injection.
 */
export async function getMemoryContext(brandProfileId: string): Promise<string> {
  const entries = await getTimeline({
    brandProfileId,
    limit: 20,
  });

  if (entries.length === 0) {
    return '';
  }

  const lines = entries.map((e, i) => {
    const fullLine = `${e.weekLabel}: ${e.summary} [${e.entryType}, ${e.sentiment}]`;
    // Sanitize for LLM injection
    return `${i + 1}. ${sanitizeUserInput(fullLine)}`;
  });

  return `\n\nMARKETING MEMORY (last ${entries.length} events, most recent first):\n${lines.join('\n')}`;
}

/**
 * Generate an insight by analyzing the brand's full marketing history.
 */
export async function generateMemoryInsight(
  brandProfileId: string,
  question: string
): Promise<string> {
  const weeklyGroups = await getWeeklyGroupedTimeline(brandProfileId, 12);

  const brandRow = db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();

  const brandContext = brandRow
    ? `${sanitizeUserInput(brandRow.name)} in ${sanitizeUserInput(brandRow.industry)} targeting ${sanitizeUserInput(brandRow.audience)}`
    : 'Unknown brand';

  const prompt = `You have access to this brand's complete marketing history.
Brand context: ${brandContext}
Marketing timeline (12 weeks, oldest first): ${JSON.stringify(weeklyGroups.map((g) => ({
  week: g.weekLabel,
  followerChange: g.netFollowerChange,
  engagementRate: g.avgEngagementRate,
  posts: g.postCount,
  summary: g.weekSummary,
  events: g.entries.map((e) => `${e.entryType}: ${e.summary}`),
})))}

Question: ${sanitizeUserInput(question)}

Answer the question using the timeline data. Cite specific weeks and events. Be direct and specific. Limit to 3 paragraphs.`;

  const text = await callWithProviderChain(
    'memory insight',
    async (provider, modelId) => {
      const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
      return t;
    },
    () => {
      // Fallback: generate from data
      const totalPosts = weeklyGroups.reduce((s, g) => s + g.postCount, 0);
      const totalFollowers = weeklyGroups.reduce((s, g) => s + g.netFollowerChange, 0);
      return `Based on the available data over ${weeklyGroups.length} weeks: The brand published ${totalPosts} posts and experienced a net follower change of ${totalFollowers}. ${totalPosts > 0 ? 'Consistent posting correlates with positive engagement trends.' : 'Increasing posting frequency would likely improve visibility and engagement.'}`;
    },
  );

  return text.trim().replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}
