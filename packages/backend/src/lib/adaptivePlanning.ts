/**
 * Adaptive Planning
 *
 * Translates accumulated performance lessons into concrete behavior rules
 * that the rest of the system applies when generating content, hashtags,
 * posting times and campaign calendars. This is the "living" piece of
 * VIMO — what we have learned changes what we do next.
 */

import { randomUUID } from 'crypto';
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles } from '../db/schema';
import { callWithProviderChain } from './llmProvider';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type BehaviorComparison = 'greater_than' | 'less_than' | 'equals';
export type BehaviorTargetSystem =
  | 'content_generation'
  | 'campaign_planning'
  | 'hashtag_strategy'
  | 'posting_time'
  | 'engagement_response';
export type BehaviorMagnitude = 'increase' | 'decrease' | 'stop' | 'start';

export interface BehaviorRuleCondition {
  metric: string;
  comparison: BehaviorComparison;
  threshold: number;
  contentType?: string;
  platform?: string;
}

export interface BehaviorRuleEffect {
  targetSystem: BehaviorTargetSystem;
  adjustment: string;
  magnitude: BehaviorMagnitude;
  parameter: string;
  newValue: unknown;
}

export interface BehaviorRule {
  ruleId: string;
  condition: BehaviorRuleCondition;
  effect: BehaviorRuleEffect;
  confidence: number;
  basedOnPostCount: number;
  learnedAt: string;
  isActive: boolean;
}

export interface AdaptivePlan {
  brandProfileId: string;
  rules: BehaviorRule[];
  lastUpdated: string;
  version: number;
}

export interface PlanningContext {
  platform?: string;
  topic?: string;
  contentType?: string;
  currentPostType?: string;
}

export interface PlanningAdjustments {
  contentTypeWeights: Record<string, number>;
  hashtagCountTarget: number;
  preferredPostingHours: number[];
  increasedPlatforms: string[];
  avoidedContentTypes: string[];
  /** Detailed human-readable notes that can be appended to prompts. */
  notes: string[];
  /** The rules that contributed to these adjustments. */
  appliedRuleIds: string[];
}

export const EMPTY_PLANNING_ADJUSTMENTS: PlanningAdjustments = {
  contentTypeWeights: {},
  hashtagCountTarget: 0,
  preferredPostingHours: [],
  increasedPlatforms: [],
  avoidedContentTypes: [],
  notes: [],
  appliedRuleIds: [],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseJsonField<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

interface PerformanceLessonLite {
  id: string;
  learnedAt: string;
  contentType: string;
  platform: string;
  engagementRate: number;
  lesson?: string;
  whatWorked?: string;
}

async function loadBrandAdaptivePlan(brandProfileId: string): Promise<AdaptivePlan> {
  const row = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();
  if (!row) throw new Error(`Brand profile ${brandProfileId} not found`);

  const stored = parseJsonField<AdaptivePlan | null>(row.adaptivePlan, null);
  if (stored && Array.isArray(stored.rules)) {
    return {
      brandProfileId,
      rules: stored.rules,
      lastUpdated: stored.lastUpdated || new Date().toISOString(),
      version: typeof stored.version === 'number' ? stored.version : 1,
    };
  }

  return {
    brandProfileId,
    rules: [],
    lastUpdated: new Date().toISOString(),
    version: 1,
  };
}

async function saveBrandAdaptivePlan(plan: AdaptivePlan): Promise<void> {
  await db
    .update(brandProfiles)
    .set({
      adaptivePlan: JSON.stringify(plan),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(brandProfiles.id, plan.brandProfileId))
    .run();
}

/* ------------------------------------------------------------------ */
/*  deriveBehaviorRules — intelligence function                         */
/* ------------------------------------------------------------------ */

/**
 * Reads the last 30 performance lessons for a brand, groups them by
 * contentType + platform, and asks the LLM to surface specific,
 * data-backed behavior rules. Writes the resulting rules to
 * brandProfiles.adaptivePlan.
 */
export async function deriveBehaviorRules(brandProfileId: string): Promise<BehaviorRule[]> {
  const row = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, brandProfileId))
    .get();
  if (!row) throw new Error(`Brand profile ${brandProfileId} not found`);

  const lessons = parseJsonField<PerformanceLessonLite[]>(row.performanceLessons, []);
  const lastLessons = lessons.slice(-30);

  // Need at least 5 lessons to make any statement meaningful
  if (lastLessons.length < 5) {
    const empty: AdaptivePlan = {
      brandProfileId,
      rules: [],
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
    await saveBrandAdaptivePlan(empty);
    return [];
  }

  // Group by contentType + platform, calculate average engagement rate
  const groupKey = (l: PerformanceLessonLite) => `${l.contentType || 'unknown'}__${l.platform || 'unknown'}`;
  const grouped: Record<string, PerformanceLessonLite[]> = {};
  for (const lesson of lastLessons) {
    const key = groupKey(lesson);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(lesson);
  }

  const overallAverage =
    lastLessons.reduce((sum, l) => sum + (Number(l.engagementRate) || 0), 0) / lastLessons.length;

  const groupedData: Array<{
    contentType: string;
    platform: string;
    sampleSize: number;
    averageEngagementRate: number;
    deltaFromOverallPct: number;
  }> = [];

  for (const [key, items] of Object.entries(grouped)) {
    if (items.length < 5) continue;
    const [contentType, platform] = key.split('__');
    const avg =
      items.reduce((sum, i) => sum + (Number(i.engagementRate) || 0), 0) / items.length;
    const deltaPct = overallAverage > 0 ? ((avg - overallAverage) / overallAverage) * 100 : 0;
    groupedData.push({
      contentType,
      platform,
      sampleSize: items.length,
      averageEngagementRate: Math.round(avg * 100) / 100,
      deltaFromOverallPct: Math.round(deltaPct * 10) / 10,
    });
  }

  if (groupedData.length === 0) {
    const empty: AdaptivePlan = {
      brandProfileId,
      rules: [],
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
    await saveBrandAdaptivePlan(empty);
    return [];
  }

  const prompt = `You are a marketing strategist analyzing performance data for a brand. Here is the performance data grouped by content type and platform: ${JSON.stringify(groupedData)}. The overall average engagement rate is ${overallAverage.toFixed(2)}%. Derive specific behavior rules from this data. Return a JSON array of BehaviorRule objects. Each rule must be specific and data-backed. Examples of valid rules: if founder_story content on linkedin averages 6.2% engagement vs 3.1% overall, create rule to increase founder_story frequency in linkedin campaigns. If hashtag count correlates negatively with reach (more hashtags = less reach based on data), create rule to decrease hashtag count to under 10. If posts at hour 19 average 40% more engagement, create rule to increase scheduling weight for that hour. Only create rules where you have at least 5 data points and the difference from the mean is statistically meaningful (over 20% difference). Return empty array if no significant patterns found.

Each rule object MUST follow this TypeScript shape (no extra fields, no comments):
{
  "ruleId": "rule-<short-slug>",
  "condition": { "metric": "engagementRate", "comparison": "greater_than" | "less_than" | "equals", "threshold": number, "contentType"?: string, "platform"?: string },
  "effect": {
    "targetSystem": "content_generation" | "campaign_planning" | "hashtag_strategy" | "posting_time" | "engagement_response",
    "adjustment": "<one short sentence describing the change>",
    "magnitude": "increase" | "decrease" | "stop" | "start",
    "parameter": "<the parameter being adjusted, e.g. contentType.frequency, hashtag.count, postingTime.hour>",
    "newValue": <number | string | boolean | array | object describing the new value>
  }
}

Return ONLY the JSON array, no markdown fences, no explanation.`;

  let rules: BehaviorRule[] = [];
  try {
    const text = await callWithProviderChain(
      'adaptive planning',
      async (provider, modelId) => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        return t;
      },
      () => '[]'
    );

    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '');
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      rules = parsed.filter(isValidBehaviorRuleShape);
    }
  } catch (err) {
    console.warn('[AdaptivePlanning] Failed to parse LLM response:', (err as Error).message);
    rules = [];
  }

  const now = new Date().toISOString();
  const enriched: BehaviorRule[] = rules.map((rule) => {
    const basedOnPostCount = derivePostCountForRule(rule, lastLessons);
    const confidence = computeConfidence(basedOnPostCount, rule);
    return {
      ...rule,
      ruleId: rule.ruleId || `rule-${randomUUID()}`,
      confidence,
      basedOnPostCount,
      learnedAt: now,
      isActive: confidence > 0.6,
    };
  });

  // Merge with existing rules — preserve any manual isActive toggles by ruleId
  const existing = await loadBrandAdaptivePlan(brandProfileId);
  const manualOverrides = new Map(
    existing.rules
      .filter((r) => enriched.some((e) => e.ruleId === r.ruleId) === false)
      .map((r) => [r.ruleId, r.isActive])
  );

  const finalRules: BehaviorRule[] = enriched.map((r) => ({
    ...r,
    isActive: manualOverrides.has(r.ruleId) ? manualOverrides.get(r.ruleId) === true && r.isActive ? true : r.isActive : r.isActive,
  }));

  // Carry over old rules that are NOT in the new set, preserving their isActive
  const newRuleIds = new Set(finalRules.map((r) => r.ruleId));
  const kept = existing.rules.filter((r) => !newRuleIds.has(r.ruleId));
  const combined = [...finalRules, ...kept];

  const plan: AdaptivePlan = {
    brandProfileId,
    rules: combined,
    lastUpdated: now,
    version: (existing.version || 1) + 1,
  };
  await saveBrandAdaptivePlan(plan);

  return combined;
}

function isValidBehaviorRuleShape(rule: unknown): rule is BehaviorRule {
  if (!rule || typeof rule !== 'object') return false;
  const r = rule as Record<string, unknown>;
  if (typeof r.ruleId !== 'string') return false;
  if (!r.condition || typeof r.condition !== 'object') return false;
  if (!r.effect || typeof r.effect !== 'object') return false;
  const c = r.condition as Record<string, unknown>;
  const e = r.effect as Record<string, unknown>;
  if (typeof c.metric !== 'string') return false;
  if (typeof c.comparison !== 'string') return false;
  if (typeof c.threshold !== 'number') return false;
  if (typeof e.targetSystem !== 'string') return false;
  if (typeof e.adjustment !== 'string') return false;
  if (typeof e.magnitude !== 'string') return false;
  if (typeof e.parameter !== 'string') return false;
  return true;
}

function derivePostCountForRule(rule: BehaviorRule, lessons: PerformanceLessonLite[]): number {
  // Count lessons that match the rule's condition filter
  const matches = lessons.filter((l) => {
    if (rule.condition.contentType && l.contentType !== rule.condition.contentType) return false;
    if (rule.condition.platform && l.platform !== rule.condition.platform) return false;
    return true;
  });
  return matches.length;
}

function computeConfidence(postCount: number, _rule: BehaviorRule): number {
  // Simple scaling: more posts => higher confidence. Capped at 0.95.
  if (postCount <= 0) return 0.1;
  if (postCount >= 20) return 0.95;
  return Math.round((0.1 + (postCount / 20) * 0.85) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/*  applyAdaptivePlan — synchronous, reads stored rules                 */
/* ------------------------------------------------------------------ */

/**
 * Reads the stored adaptive plan for a brand and returns a
 * PlanningAdjustments object that downstream services can apply.
 * Pure read — no LLM calls.
 */
export async function applyAdaptivePlan(
  brandProfileId: string,
  context: PlanningContext = {}
): Promise<PlanningAdjustments> {
  let plan: AdaptivePlan;
  try {
    plan = await loadBrandAdaptivePlan(brandProfileId);
  } catch {
    return { ...EMPTY_PLANNING_ADJUSTMENTS };
  }

  const activeRules = plan.rules.filter((r) => r.isActive);
  if (activeRules.length === 0) {
    return { ...EMPTY_PLANNING_ADJUSTMENTS };
  }

  const adjustments: PlanningAdjustments = {
    contentTypeWeights: {},
    hashtagCountTarget: 0,
    preferredPostingHours: [],
    increasedPlatforms: [],
    avoidedContentTypes: [],
    notes: [],
    appliedRuleIds: [],
  };

  for (const rule of activeRules) {
    adjustments.appliedRuleIds.push(rule.ruleId);

    const magnitude = rule.effect.magnitude;
    const param = rule.effect.parameter;

    // content_generation rules: most often tweak contentType weights
    if (rule.effect.targetSystem === 'content_generation' || param.startsWith('contentType')) {
      const ct = rule.condition.contentType || (typeof rule.effect.newValue === 'string' ? rule.effect.newValue : null);
      if (ct) {
        const factor = magnitude === 'increase' ? 2.0 : magnitude === 'decrease' ? 0.5 : 0;
        if (factor > 0) {
          adjustments.contentTypeWeights[ct] = (adjustments.contentTypeWeights[ct] || 1) * factor;
        }
        if (magnitude === 'stop') {
          if (!adjustments.avoidedContentTypes.includes(ct)) {
            adjustments.avoidedContentTypes.push(ct);
          }
        }
        if (context.contentType === ct && magnitude === 'stop') {
          adjustments.notes.push(`Avoiding ${ct} on ${rule.condition.platform || 'all platforms'} (${rule.effect.adjustment})`);
        } else {
          adjustments.notes.push(formatRuleNote(rule, ct, context));
        }
      } else {
        adjustments.notes.push(formatRuleNote(rule, null, context));
      }
    } else if (rule.effect.targetSystem === 'hashtag_strategy' || param.startsWith('hashtag')) {
      const newVal = Number(rule.effect.newValue);
      if (!Number.isNaN(newVal) && newVal > 0) {
        if (magnitude === 'decrease') {
          // take the lower of the two
          if (adjustments.hashtagCountTarget === 0 || newVal < adjustments.hashtagCountTarget) {
            adjustments.hashtagCountTarget = newVal;
          }
        } else if (magnitude === 'increase') {
          if (newVal > adjustments.hashtagCountTarget) {
            adjustments.hashtagCountTarget = newVal;
          }
        } else {
          adjustments.hashtagCountTarget = newVal;
        }
      }
      adjustments.notes.push(formatRuleNote(rule, null, context));
    } else if (rule.effect.targetSystem === 'posting_time' || param.startsWith('postingTime')) {
      const hours = extractHours(rule.effect.newValue);
      for (const h of hours) {
        if (!adjustments.preferredPostingHours.includes(h)) {
          adjustments.preferredPostingHours.push(h);
        }
      }
      adjustments.notes.push(formatRuleNote(rule, null, context));
    } else if (rule.effect.targetSystem === 'campaign_planning') {
      const ct = rule.condition.contentType;
      const platform = rule.condition.platform;
      if (ct) {
        const factor = magnitude === 'increase' ? 2.0 : magnitude === 'decrease' ? 0.5 : 0;
        if (factor > 0) {
          adjustments.contentTypeWeights[ct] = (adjustments.contentTypeWeights[ct] || 1) * factor;
        }
        if (magnitude === 'stop' && !adjustments.avoidedContentTypes.includes(ct)) {
          adjustments.avoidedContentTypes.push(ct);
        }
      }
      if (platform && magnitude === 'increase' && !adjustments.increasedPlatforms.includes(platform)) {
        adjustments.increasedPlatforms.push(platform);
      }
      adjustments.notes.push(formatRuleNote(rule, ct ?? null, context));
    } else {
      adjustments.notes.push(formatRuleNote(rule, null, context));
    }
  }

  // Filter notes to those relevant to the current context
  if (context.contentType) {
    adjustments.notes = adjustments.notes.filter((n) => n && n.length > 0);
  }

  return adjustments;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function extractHours(newValue: unknown): number[] {
  if (Array.isArray(newValue)) {
    return newValue.filter((v): v is number => typeof v === 'number').filter((v) => v >= 0 && v <= 23);
  }
  if (typeof newValue === 'number' && newValue >= 0 && newValue <= 23) {
    return [newValue];
  }
  if (typeof newValue === 'string') {
    const matches = newValue.match(/\b([0-9]|[01]\d|2[0-3])\b/g);
    if (matches) return matches.map((m) => Number(m)).filter((n) => n >= 0 && n <= 23);
  }
  return [];
}

function formatRuleNote(rule: BehaviorRule, contentType: string | null, _context: PlanningContext): string {
  const adj = rule.effect.adjustment;
  if (contentType) {
    return `${rule.effect.magnitude.toUpperCase()} ${contentType} — ${adj}`;
  }
  return `${rule.effect.magnitude.toUpperCase()} — ${adj}`;
}

/* ------------------------------------------------------------------ */
/*  Manual rule management helpers                                     */
/* ------------------------------------------------------------------ */

export async function toggleBehaviorRule(
  brandProfileId: string,
  ruleId: string,
  isActive: boolean
): Promise<AdaptivePlan | null> {
  const plan = await loadBrandAdaptivePlan(brandProfileId);
  const target = plan.rules.find((r) => r.ruleId === ruleId);
  if (!target) return null;
  target.isActive = isActive;
  plan.lastUpdated = new Date().toISOString();
  plan.version = (plan.version || 1) + 1;
  await saveBrandAdaptivePlan(plan);
  return plan;
}

export async function getAdaptivePlan(brandProfileId: string): Promise<AdaptivePlan> {
  return loadBrandAdaptivePlan(brandProfileId);
}
