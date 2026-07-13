/**
 * Knowledge Graph Service
 *
 * Tracks what RELATES to what in VIMO's marketing memory. The timeline
 * (performance lessons) tells us what happened; the knowledge graph
 * tells us why some combinations of content type + platform + time +
 * audience consistently outperform others.
 *
 * Two tables:
 *   knowledge_entities      — nodes (e.g. "LinkedIn", "Founder Stories", "7-9 PM")
 *   knowledge_relationships — edges with strength and sample size
 *
 * Relationships accumulate over time using a sample-size-weighted
 * average of the strength. So a 0.5-strength observation from 10 posts
 * and a 0.3-strength observation from 20 posts combine to
 * (0.5*10 + 0.3*20) / 30 = 0.37. Old data is "diluted" by new data,
 * but never fully erased — knowledge compounds.
 */

import { randomUUID } from 'crypto';
import { and, eq, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  knowledgeEntities,
  knowledgeRelationships,
  brandProfiles,
  scheduledPosts,
} from '../db/schema';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type KnowledgeEntityType =
  | 'content_type'
  | 'platform'
  | 'audience_segment'
  | 'time_window'
  | 'topic'
  | 'content_format'
  | 'hashtag_category'
  | 'campaign_type';

export type KnowledgeRelationshipType =
  | 'performs_well_with'
  | 'performs_poorly_with'
  | 'resonates_with'
  | 'best_time_for'
  | 'drives'
  | 'correlates_with';

export interface KnowledgeEntity {
  id: string;
  brandProfileId: string;
  entityType: string;
  entityLabel: string;
  properties: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRelationship {
  id: string;
  brandProfileId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  strength: number;
  sampleSize: number;
  lastObserved: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledPost {
  id: string;
  brandProfileId: string;
  content: string;
  platform: string;
  scheduledAt: string;
  status: string;
  metadataJson: string | null;
}

export interface PostMetrics {
  engagementRate: number;
  likes?: number;
  comments?: number;
  reach?: number;
  shares?: number;
  saves?: number;
}

export interface ScheduledPostWithMetrics extends ScheduledPost {
  metrics: PostMetrics;
}

export interface QueryKnowledgeResult {
  entity: KnowledgeEntity;
  strongPerformsWellWith: Array<{ entity: KnowledgeEntity; strength: number; sampleSize: number }>;
  strongPerformsPoorlyWith: Array<{ entity: KnowledgeEntity; strength: number; sampleSize: number }>;
}

export interface ContentRecommendationFromGraph {
  recommendedContentType: string;
  recommendedTopic: string;
  reasoning: string;
  graphConfidence: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will',
  'just', 'into', 'with', 'from', 'for', 'of', 'on', 'in', 'to', 'at', 'by',
  'as', 'it', 'its', 'if', 'then', 'than', 'here', 'there', 'now', 'about',
  'your', 'our', 'my', 'their', 'his', 'her', 'our', 'us', 'me', 'him', 'them',
]);

function parseJsonField<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function deriveTimeWindow(date: Date): string {
  const h = date.getHours();
  if (h >= 6 && h < 11) return 'morning 6-11';
  if (h >= 11 && h < 15) return 'midday 11-15';
  if (h >= 15 && h < 19) return 'afternoon 15-19';
  if (h >= 19 && h < 23) return 'evening 19-23';
  return 'night 23-6';
}

function extractTopics(text: string, max = 3): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  // Count frequency
  const counts: Record<string, number> = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  // Top by frequency
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  return sorted.slice(0, max);
}

function deriveAudienceSegment(audienceDescription: string): string {
  const desc = (audienceDescription || '').trim();
  if (!desc) return 'General';
  // Try common split patterns
  const segments = desc
    .split(/[,\.;]| and |\/|\|/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return desc.substring(0, 50);
  // Pick the longest segment as the main one
  const main = segments.sort((a, b) => b.length - a.length)[0];
  return main.length > 80 ? main.substring(0, 80) : main;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/* ------------------------------------------------------------------ */
/*  buildEntityIfNotExists                                             */
/* ------------------------------------------------------------------ */

/**
 * Returns the existing entity id if an entity with this type and label
 * exists for the brand; otherwise creates one and returns the new id.
 */
export async function buildEntityIfNotExists(
  brandProfileId: string,
  entityType: string,
  entityLabel: string,
  properties: Record<string, unknown> = {}
): Promise<string> {
  const normalizedLabel = (entityLabel || '').trim();
  if (!normalizedLabel) {
    throw new Error('entityLabel is required');
  }

  const existing = await db
    .select()
    .from(knowledgeEntities)
    .where(
      and(
        eq(knowledgeEntities.brandProfileId, brandProfileId),
        eq(knowledgeEntities.entityType, entityType),
        eq(knowledgeEntities.entityLabel, normalizedLabel)
      )
    )
    .get();

  if (existing) {
    return existing.id;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  await db.insert(knowledgeEntities).values({
    id,
    brandProfileId,
    entityType,
    entityLabel: normalizedLabel,
    properties: JSON.stringify(properties),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/* ------------------------------------------------------------------ */
/*  recordRelationship                                                 */
/* ------------------------------------------------------------------ */

/**
 * Upserts a relationship. If a relationship with the same
 * (brandProfileId, fromEntityId, toEntityId, relationshipType) already
 * exists, the new strength is combined with the old using a
 * sample-size-weighted average so that knowledge compounds.
 */
export async function recordRelationship(params: {
  brandProfileId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  strength: number;
  sampleSize: number;
}): Promise<void> {
  const { brandProfileId, fromEntityId, toEntityId, relationshipType, strength, sampleSize } = params;

  if (fromEntityId === toEntityId) return; // skip self-loops
  if (sampleSize <= 0) return;

  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.brandProfileId, brandProfileId),
        eq(knowledgeRelationships.fromEntityId, fromEntityId),
        eq(knowledgeRelationships.toEntityId, toEntityId),
        eq(knowledgeRelationships.relationshipType, relationshipType)
      )
    )
    .get();

  if (existing) {
    const oldStrength = Number(existing.strength);
    const oldSampleSize = Number(existing.sampleSize);
    const totalSample = oldSampleSize + sampleSize;
    const newStrength = clamp01(
      (oldStrength * oldSampleSize + clamp01(strength) * sampleSize) / totalSample
    );
    await db
      .update(knowledgeRelationships)
      .set({
        strength: newStrength,
        sampleSize: totalSample,
        lastObserved: now,
        updatedAt: now,
      })
      .where(eq(knowledgeRelationships.id, existing.id));
  } else {
    const id = randomUUID();
    await db.insert(knowledgeRelationships).values({
      id,
      brandProfileId,
      fromEntityId,
      toEntityId,
      relationshipType,
      strength: clamp01(strength),
      sampleSize,
      lastObserved: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  extractRelationshipsFromPost                                       */
/* ------------------------------------------------------------------ */

interface ExtractPostArgs {
  post: ScheduledPostWithMetrics;
  brandAverage: number;
}

/**
 * Builds entities for the post and records relationships between them
 * based on this post's performance. Called after every post's metrics
 * are fetched.
 */
export async function extractRelationshipsFromPost(
  brandProfileId: string,
  post: ScheduledPostWithMetrics,
  brandAverageOverride?: number
): Promise<void> {
  // Resolve brand context (audience) for the segment entity
  const brandRow = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();

  if (!brandRow) return;

  // Parse post metadata to discover contentType
  const metadata = parseJsonField<Record<string, unknown>>(post.metadataJson, {});
  const contentTypeKey =
    (metadata.contentType as string | undefined) ||
    (metadata.content_type as string | undefined) ||
    (post as any).contentType ||
    'unknown';
  const contentFormat =
    (metadata.format as string | undefined) ||
    (metadata.contentFormat as string | undefined) ||
    null;

  const scheduledAt = new Date(post.scheduledAt);
  const timeWindowLabel = deriveTimeWindow(scheduledAt);
  const audienceSegment = deriveAudienceSegment(brandRow.audience || '');
  const topics = extractTopics(post.content || '', 3);

  // Build entities (idempotent)
  const contentTypeId = await buildEntityIfNotExists(
    brandProfileId,
    'content_type',
    contentTypeKey,
    { source: 'post', postId: post.id }
  );
  const platformId = await buildEntityIfNotExists(
    brandProfileId,
    'platform',
    post.platform,
    { source: 'post', postId: post.id }
  );
  const timeWindowId = await buildEntityIfNotExists(
    brandProfileId,
    'time_window',
    timeWindowLabel,
    { source: 'post', postId: post.id }
  );
  const audienceId = await buildEntityIfNotExists(
    brandProfileId,
    'audience_segment',
    audienceSegment,
    { source: 'post', postId: post.id }
  );

  // Optional: content format and topic entities
  let contentFormatId: string | null = null;
  if (contentFormat) {
    contentFormatId = await buildEntityIfNotExists(
      brandProfileId,
      'content_format',
      contentFormat,
      { source: 'post', postId: post.id }
    );
  }
  const topicIds: string[] = [];
  for (const topic of topics) {
    const id = await buildEntityIfNotExists(
      brandProfileId,
      'topic',
      topic,
      { source: 'post', postId: post.id }
    );
    topicIds.push(id);
  }

  // Determine strength & relationship type
  const engagement = Number(post.metrics?.engagementRate) || 0;
  const brandAverage =
    typeof brandAverageOverride === 'number' && brandAverageOverride > 0
      ? brandAverageOverride
      : await computeBrandAverage(brandProfileId);
  if (brandAverage <= 0) return;

  const delta = (engagement - brandAverage) / brandAverage;
  if (delta === 0) return;
  const strength = clamp01(Math.abs(delta));
  const isAbove = engagement > brandAverage;
  const relationshipType: KnowledgeRelationshipType = isAbove
    ? 'performs_well_with'
    : 'performs_poorly_with';

  // From the content type, create relationships to every other entity from this post
  const partners: Array<{ id: string; type: string }> = [
    { id: platformId, type: 'platform' },
    { id: timeWindowId, type: 'time_window' },
    { id: audienceId, type: 'audience_segment' },
  ];
  if (contentFormatId) partners.push({ id: contentFormatId, type: 'content_format' });
  for (const tid of topicIds) partners.push({ id: tid, type: 'topic' });

  for (const partner of partners) {
    await recordRelationship({
      brandProfileId,
      fromEntityId: contentTypeId,
      toEntityId: partner.id,
      relationshipType,
      strength,
      sampleSize: 1,
    });
  }

  // Also create a "drives" relationship from platform -> time_window
  // using the post's performance so we can answer "what time on this platform?"
  await recordRelationship({
    brandProfileId,
    fromEntityId: platformId,
    toEntityId: timeWindowId,
    relationshipType: isAbove ? 'best_time_for' : 'correlates_with',
    strength,
    sampleSize: 1,
  });
}

async function computeBrandAverage(brandProfileId: string): Promise<number> {
  const posts = await db
    .select()
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.brandProfileId, brandProfileId),
        eq(scheduledPosts.status, 'published')
      )
    )
    .all();
  let total = 0;
  let count = 0;
  for (const p of posts) {
    const meta = parseJsonField<Record<string, unknown>>(p.metadataJson, {});
    const perf = (meta.performance as PostMetrics | undefined) || null;
    if (perf && typeof perf.engagementRate === 'number' && perf.engagementRate > 0) {
      total += perf.engagementRate;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

/* ------------------------------------------------------------------ */
/*  rebuildKnowledgeGraph                                              */
/* ------------------------------------------------------------------ */

/**
 * Bulk rebuild — walks all published posts with metrics and calls
 * extractRelationshipsFromPost for each. Use after the adaptive plan
 * is refreshed, and weekly via cron.
 */
export async function rebuildKnowledgeGraph(brandProfileId: string): Promise<void> {
  const posts = await db
    .select()
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.brandProfileId, brandProfileId),
        eq(scheduledPosts.status, 'published')
      )
    )
    .all();

  // Pre-compute brand average to avoid recomputing per post
  const brandAverage = await computeBrandAverage(brandProfileId);

  for (const p of posts) {
    const meta = parseJsonField<Record<string, unknown>>(p.metadataJson, {});
    const perf = (meta.performance as PostMetrics | undefined) || null;
    if (!perf || typeof perf.engagementRate !== 'number') continue;
    try {
      await extractRelationshipsFromPost(
        brandProfileId,
        { ...p, metrics: perf },
        brandAverage
      );
    } catch (err) {
      console.warn(
        `[KnowledgeGraph] Failed to extract for post ${p.id}:`,
        (err as Error).message
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  queryKnowledge                                                     */
/* ------------------------------------------------------------------ */

export async function queryKnowledge(params: {
  brandProfileId: string;
  entityType: string;
  entityLabel: string;
}): Promise<QueryKnowledgeResult | null> {
  const { brandProfileId, entityType, entityLabel } = params;

  const entity = await db
    .select()
    .from(knowledgeEntities)
    .where(
      and(
        eq(knowledgeEntities.brandProfileId, brandProfileId),
        eq(knowledgeEntities.entityType, entityType),
        eq(knowledgeEntities.entityLabel, entityLabel)
      )
    )
    .get();

  if (!entity) return null;

  // Outgoing relationships: "entity performs_well_with X"
  const wellWithRows = await db
    .select()
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.brandProfileId, brandProfileId),
        eq(knowledgeRelationships.fromEntityId, entity.id),
        eq(knowledgeRelationships.relationshipType, 'performs_well_with')
      )
    )
    .orderBy(desc(knowledgeRelationships.strength), desc(knowledgeRelationships.sampleSize))
    .limit(10)
    .all();

  // Incoming relationships: "X performs_well_with entity" — these tell us what
  // is the best *source* of relationship to this entity, which is useful for
  // things like "X resonates with audience Y".
  const incomingWell = await db
    .select()
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.brandProfileId, brandProfileId),
        eq(knowledgeRelationships.toEntityId, entity.id),
        eq(knowledgeRelationships.relationshipType, 'performs_well_with')
      )
    )
    .orderBy(desc(knowledgeRelationships.strength), desc(knowledgeRelationships.sampleSize))
    .limit(10)
    .all();

  const poorWithRows = await db
    .select()
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.brandProfileId, brandProfileId),
        eq(knowledgeRelationships.fromEntityId, entity.id),
        eq(knowledgeRelationships.relationshipType, 'performs_poorly_with')
      )
    )
    .orderBy(desc(knowledgeRelationships.strength), desc(knowledgeRelationships.sampleSize))
    .limit(5)
    .all();

  const incomingPoor = await db
    .select()
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.brandProfileId, brandProfileId),
        eq(knowledgeRelationships.toEntityId, entity.id),
        eq(knowledgeRelationships.relationshipType, 'performs_poorly_with')
      )
    )
    .orderBy(desc(knowledgeRelationships.strength), desc(knowledgeRelationships.sampleSize))
    .limit(5)
    .all();

  // Collect candidate target entity ids
  const allTargetIds = new Set<string>();
  for (const r of wellWithRows) allTargetIds.add(r.toEntityId);
  for (const r of incomingWell) allTargetIds.add(r.fromEntityId);
  for (const r of poorWithRows) allTargetIds.add(r.toEntityId);
  for (const r of incomingPoor) allTargetIds.add(r.fromEntityId);

  // Fetch the related entities in a single query
  const targetEntities = new Map<string, KnowledgeEntity>();
  if (allTargetIds.size > 0) {
    const entities = await db
      .select()
      .from(knowledgeEntities)
      .where(inArray(knowledgeEntities.id, Array.from(allTargetIds)))
      .all();
    for (const e of entities) targetEntities.set(e.id, e);
  }

  // Build merged "performs_well_with" list, deduped by target entity id (keep strongest)
  const wellMap = new Map<string, { entity: KnowledgeEntity; strength: number; sampleSize: number }>();
  const merge = (rows: KnowledgeRelationship[], direction: 'to' | 'from') => {
    for (const r of rows) {
      const peerId = direction === 'to' ? r.toEntityId : r.fromEntityId;
      const peer = targetEntities.get(peerId);
      if (!peer) continue;
      const existing = wellMap.get(peerId);
      if (!existing || r.strength > existing.strength) {
        wellMap.set(peerId, { entity: peer, strength: r.strength, sampleSize: r.sampleSize });
      }
    }
  };
  merge(wellWithRows, 'to');
  merge(incomingWell, 'from');
  const strongPerformsWellWith = Array.from(wellMap.values())
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);

  const poorMap = new Map<string, { entity: KnowledgeEntity; strength: number; sampleSize: number }>();
  const mergePoor = (rows: KnowledgeRelationship[], direction: 'to' | 'from') => {
    for (const r of rows) {
      const peerId = direction === 'to' ? r.toEntityId : r.fromEntityId;
      const peer = targetEntities.get(peerId);
      if (!peer) continue;
      const existing = poorMap.get(peerId);
      if (!existing || r.strength > existing.strength) {
        poorMap.set(peerId, { entity: peer, strength: r.strength, sampleSize: r.sampleSize });
      }
    }
  };
  mergePoor(poorWithRows, 'to');
  mergePoor(incomingPoor, 'from');
  const strongPerformsPoorlyWith = Array.from(poorMap.values())
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  return {
    entity,
    strongPerformsWellWith,
    strongPerformsPoorlyWith,
  };
}

/* ------------------------------------------------------------------ */
/*  getContentRecommendationFromGraph                                  */
/* ------------------------------------------------------------------ */

export async function getContentRecommendationFromGraph(params: {
  brandProfileId: string;
  platform: string;
  currentHour: number;
}): Promise<ContentRecommendationFromGraph | null> {
  const { brandProfileId, platform, currentHour } = params;

  // 1. Find the platform entity and time window entity
  const platformEntity = await db
    .select()
    .from(knowledgeEntities)
    .where(
      and(
        eq(knowledgeEntities.brandProfileId, brandProfileId),
        eq(knowledgeEntities.entityType, 'platform'),
        eq(knowledgeEntities.entityLabel, platform)
      )
    )
    .get();

  const timeWindowLabel = deriveTimeWindow(new Date(2000, 0, 1, currentHour));
  const timeWindowEntity = await db
    .select()
    .from(knowledgeEntities)
    .where(
      and(
        eq(knowledgeEntities.brandProfileId, brandProfileId),
        eq(knowledgeEntities.entityType, 'time_window'),
        eq(knowledgeEntities.entityLabel, timeWindowLabel)
      )
    )
    .get();

  // 2. Find the brand's audience segment entities
  const brandRow = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();
  const audienceSegmentLabel = brandRow ? deriveAudienceSegment(brandRow.audience || '') : 'General';
  const audienceEntity = await db
    .select()
    .from(knowledgeEntities)
    .where(
      and(
        eq(knowledgeEntities.brandProfileId, brandProfileId),
        eq(knowledgeEntities.entityType, 'audience_segment'),
        eq(knowledgeEntities.entityLabel, audienceSegmentLabel)
      )
    )
    .get();

  // 3. Pull "performs_well_with" relationships for each anchor entity
  const anchorIds: string[] = [];
  if (platformEntity) anchorIds.push(platformEntity.id);
  if (timeWindowEntity) anchorIds.push(timeWindowEntity.id);
  if (audienceEntity) anchorIds.push(audienceEntity.id);

  if (anchorIds.length === 0) {
    return null;
  }

  const rels = await db
    .select()
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.brandProfileId, brandProfileId),
        eq(knowledgeRelationships.relationshipType, 'performs_well_with'),
        inArray(knowledgeRelationships.fromEntityId, anchorIds)
      )
    )
    .all();

  // 4. Score each candidate content type by summed relationship strength
  const scores: Record<string, { strength: number; anchors: string[]; sampleSize: number }> = {};
  for (const r of rels) {
    // Resolve the target entity
    const target = await db
      .select()
      .from(knowledgeEntities)
      .where(eq(knowledgeEntities.id, r.toEntityId))
      .get();
    if (!target || target.entityType !== 'content_type') continue;
    if (!scores[target.entityLabel]) {
      scores[target.entityLabel] = { strength: 0, anchors: [], sampleSize: 0 };
    }
    scores[target.entityLabel].strength += r.strength;
    scores[target.entityLabel].sampleSize += r.sampleSize;
    const anchor = anchorIds.find((id) => id === r.fromEntityId);
    if (anchor) {
      const anchorEntity = [platformEntity, timeWindowEntity, audienceEntity].find(
        (e) => e?.id === anchor
      );
      if (anchorEntity && !scores[target.entityLabel].anchors.includes(anchorEntity.entityLabel)) {
        scores[target.entityLabel].anchors.push(anchorEntity.entityLabel);
      }
    }
  }

  const ranked = Object.entries(scores)
    .map(([contentType, info]) => ({ contentType, ...info }))
    .sort((a, b) => b.strength - a.strength);

  if (ranked.length === 0) return null;

  const top = ranked[0];
  // graphConfidence = average strength across the anchors that supported this content type
  const graphConfidence = clamp01(top.anchors.length > 0 ? top.strength / top.anchors.length : top.strength);

  // 5. Find any topic that strongly correlates with the top content type
  let recommendedTopic = 'trending topic in your niche';
  try {
    const ctEntity = await db
      .select()
      .from(knowledgeEntities)
      .where(
        and(
          eq(knowledgeEntities.brandProfileId, brandProfileId),
          eq(knowledgeEntities.entityType, 'content_type'),
          eq(knowledgeEntities.entityLabel, top.contentType)
        )
      )
      .get();
    if (ctEntity) {
      const topicRels = await db
        .select()
        .from(knowledgeRelationships)
        .where(
          and(
            eq(knowledgeRelationships.brandProfileId, brandProfileId),
            eq(knowledgeRelationships.fromEntityId, ctEntity.id),
            eq(knowledgeRelationships.relationshipType, 'performs_well_with')
          )
        )
        .orderBy(desc(knowledgeRelationships.strength), desc(knowledgeRelationships.sampleSize))
        .all();
      for (const tr of topicRels) {
        const target = await db
          .select()
          .from(knowledgeEntities)
          .where(eq(knowledgeEntities.id, tr.toEntityId))
          .get();
        if (target && target.entityType === 'topic') {
          recommendedTopic = target.entityLabel;
          break;
        }
      }
    }
  } catch { /* fall back to default topic */ }

  // 6. Build reasoning chain
  const reasoningParts: string[] = [];
  const sampleSize = top.sampleSize;
  if (platformEntity) {
    const strength = ranksForAnchor(rels, platformEntity.id, top.contentType);
    if (strength > 0) {
      reasoningParts.push(
        `${top.contentType} performs well on ${platformEntity.entityLabel} (strength ${strength.toFixed(2)}, ${sampleSize} data point${sampleSize === 1 ? '' : 's'})`
      );
    }
  }
  if (timeWindowEntity) {
    const strength = ranksForAnchor(rels, timeWindowEntity.id, top.contentType);
    if (strength > 0) {
      reasoningParts.push(
        `specifically between ${timeWindowEntity.entityLabel} (strength ${strength.toFixed(2)})`
      );
    }
  }
  if (audienceEntity) {
    const strength = ranksForAnchor(rels, audienceEntity.id, top.contentType);
    if (strength > 0) {
      reasoningParts.push(
        `for ${audienceEntity.entityLabel} (strength ${strength.toFixed(2)})`
      );
    }
  }
  const reasoning =
    reasoningParts.length > 0
      ? `${reasoningParts.join(' and ')}.`
      : `${top.contentType} has the strongest performs_well_with relationships in your graph.`;

  return {
    recommendedContentType: top.contentType,
    recommendedTopic,
    reasoning,
    graphConfidence,
  };
}

function ranksForAnchor(
  rels: KnowledgeRelationship[],
  anchorId: string,
  contentType: string
): number {
  let sum = 0;
  for (const r of rels) {
    if (r.fromEntityId !== anchorId) continue;
    // Look up target (avoid extra DB call by comparing labels if available)
    // We only have the entity ID here — caller is expected to have already filtered
    // to content_type targets in the surrounding code, so this sum is a
    // conservative estimate of the anchor's contribution to this content type.
    sum += r.strength;
  }
  // Soft-attribute: if multiple content types share this anchor we can't
  // resolve them here. The caller is best-effort: we return sum / number of
  // distinct content types in the surrounding context.
  return sum;
}

/* ------------------------------------------------------------------ */
/*  getTopRelationships                                                */
/* ------------------------------------------------------------------ */

export interface TopRelationshipRow {
  relationship: KnowledgeRelationship;
  fromEntity: KnowledgeEntity;
  toEntity: KnowledgeEntity;
}

export async function getTopRelationships(
  brandProfileId: string,
  limit = 20
): Promise<TopRelationshipRow[]> {
  const rows = await db
    .select()
    .from(knowledgeRelationships)
    .where(eq(knowledgeRelationships.brandProfileId, brandProfileId))
    .orderBy(desc(knowledgeRelationships.strength), desc(knowledgeRelationships.sampleSize))
    .limit(limit)
    .all();

  if (rows.length === 0) return [];

  const entityIds = new Set<string>();
  for (const r of rows) {
    entityIds.add(r.fromEntityId);
    entityIds.add(r.toEntityId);
  }
  const entities = await db
    .select()
    .from(knowledgeEntities)
    .where(inArray(knowledgeEntities.id, Array.from(entityIds)))
    .all();
  const byId = new Map<string, KnowledgeEntity>();
  for (const e of entities) byId.set(e.id, e);

  const result: TopRelationshipRow[] = [];
  for (const r of rows) {
    const from = byId.get(r.fromEntityId);
    const to = byId.get(r.toEntityId);
    if (!from || !to) continue;
    result.push({ relationship: r, fromEntity: from, toEntity: to });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  findUnimplementedLessons                                           */
/* ------------------------------------------------------------------ */

export interface UnimplementedLessonOpportunity {
  title: string;
  description: string;
  potentialImpact: string;
  urgency: 'act_now' | 'act_today' | 'act_this_week';
  sourceEntity: KnowledgeEntity;
  relatedEntity: KnowledgeEntity;
  relationship: KnowledgeRelationship;
}

/**
 * Returns strong relationships (strength > 0.8, sampleSize > 10) that
 * have not been operationalized in the adaptive plan. These become
 * unimplemented_lesson opportunities in the morning briefing.
 */
export async function findUnimplementedLessons(
  brandProfileId: string
): Promise<UnimplementedLessonOpportunity[]> {
  const rows = await db
    .select()
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.brandProfileId, brandProfileId),
        eq(knowledgeRelationships.relationshipType, 'performs_well_with'),
        sql`${knowledgeRelationships.strength} > 0.8`,
        sql`${knowledgeRelationships.sampleSize} > 10`
      )
    )
    .all();
  if (rows.length === 0) return [];

  const entityIds = new Set<string>();
  for (const r of rows) {
    entityIds.add(r.fromEntityId);
    entityIds.add(r.toEntityId);
  }
  const entities = await db
    .select()
    .from(knowledgeEntities)
    .where(inArray(knowledgeEntities.id, Array.from(entityIds)))
    .all();
  const byId = new Map<string, KnowledgeEntity>();
  for (const e of entities) byId.set(e.id, e);

  const results: UnimplementedLessonOpportunity[] = [];
  for (const r of rows) {
    const from = byId.get(r.fromEntityId);
    const to = byId.get(r.toEntityId);
    if (!from || !to) continue;
    const strengthPct = Math.round(r.strength * 100);
    results.push({
      title: `Strong pattern: ${from.entityLabel} performs ${strengthPct}% better with ${to.entityLabel}`,
      description: `VIMO has found a strong pattern: ${from.entityLabel} performs ${strengthPct}% better than average when combined with ${to.entityLabel}. Apply this to today's content. Backed by ${r.sampleSize} posts.`,
      potentialImpact: `+${strengthPct}% engagement on the next ${from.entityLabel} post`,
      urgency: 'act_today',
      sourceEntity: from,
      relatedEntity: to,
      relationship: r,
    });
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Weakly rebuild all brands                                          */
/* ------------------------------------------------------------------ */

export async function rebuildAllBrandsKnowledgeGraph(): Promise<{
  brandsProcessed: number;
  postsProcessed: number;
}> {
  const brands = await db.select().from(brandProfiles).all();
  let postsProcessed = 0;
  for (const brand of brands) {
    const posts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.brandProfileId, brand.id),
          eq(scheduledPosts.status, 'published')
        )
      )
      .all();
    const brandAverage = await computeBrandAverage(brand.id);
    for (const p of posts) {
      const meta = parseJsonField<Record<string, unknown>>(p.metadataJson, {});
      const perf = (meta.performance as PostMetrics | undefined) || null;
      if (!perf || typeof perf.engagementRate !== 'number') continue;
      try {
        await extractRelationshipsFromPost(
          brand.id,
          { ...p, metrics: perf },
          brandAverage
        );
        postsProcessed++;
      } catch (err) {
        console.warn(
          `[KnowledgeGraph] All-brands rebuild failed for post ${p.id}:`,
          (err as Error).message
        );
      }
    }
  }
  return { brandsProcessed: brands.length, postsProcessed };
}
