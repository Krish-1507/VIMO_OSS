/**
 * Marketing Sprint — the agent "swarm" behind one user goal.
 *
 * A sprint fans out to trend/competitor/opportunity specialists in parallel,
 * snapshots analytics, and drafts follow-ups — then returns ONE report.
 * Drafts only: a sprint must never schedule or publish on its own.
 *
 * The network boundary (research fetches) and the LLM chain are mocked so
 * the test drives the REAL orchestration deterministically: parallel fan-out,
 * per-worker degradation into warnings, and draft production via template
 * fallbacks. VIMO's own logic is what we assert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

// No network, fail fast — every research fetch degrades into a warning.
vi.mock('axios', () => ({
  default: {
    get: vi.fn(async () => {
      throw new Error('no network in tests');
    }),
    post: vi.fn(async () => {
      throw new Error('no network in tests');
    }),
  },
}));

// LLM chain always takes the template fallback (no network, no real LLM).
vi.mock('../lib/llmProvider', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    callWithProviderChain: async (_task: string, _fn: unknown, fallback?: () => unknown) =>
      fallback ? (fallback as () => unknown)() : {},
  };
});

import { db } from '../db';
import { brandProfiles, scheduledPosts } from '../db/schema';
import { runMarketingSprint } from '../services/marketingSprintService';

const BRAND = 'brand_sprint_test';

function seedBrand(): void {
  const existing = db.select().from(brandProfiles).where(eq(brandProfiles.id, BRAND)).get();
  if (existing) return;
  const now = new Date().toISOString();
  db.insert(brandProfiles)
    .values({
      id: BRAND,
      name: 'Sprint Co',
      industry: 'Software',
      audience: 'Founders',
      toneKeywordsJson: JSON.stringify(['bold']),
      examplePostsJson: JSON.stringify([]),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe('runMarketingSprint', () => {
  beforeEach(() => {
    seedBrand();
    db.delete(scheduledPosts).where(eq(scheduledPosts.brandProfileId, BRAND)).run();
  });

  it('fans out, degrades workers into warnings, and returns drafts', async () => {
    const report = await runMarketingSprint({
      brandProfileId: BRAND,
      goal: 'launch our summer sale',
      platforms: ['instagram', 'linkedin'],
      maxDrafts: 2,
    });

    expect(report.goal).toBe('launch our summer sale');
    expect(report.brandName).toBe('Sprint Co');
    // Network is dead in tests: workers must degrade, never throw.
    expect(Array.isArray(report.warnings)).toBe(true);
    // Template fallbacks still produce drafts from the goal itself.
    expect(report.drafts.length).toBeGreaterThanOrEqual(1);
    expect(report.drafts.length).toBeLessThanOrEqual(2);
    for (const draft of report.drafts) {
      expect(draft.text.length).toBeGreaterThan(20);
      expect(['instagram', 'linkedin']).toContain(draft.platform);
    }
    expect(report.analytics.totalPosts).toBe(0);
    expect(new Date(report.completedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(report.startedAt).getTime(),
    );
  }, 60000);

  it('rejects an empty goal and an unknown brand honestly', async () => {
    await expect(runMarketingSprint({ brandProfileId: BRAND, goal: '   ' })).rejects.toThrow(/goal/i);
    await expect(
      runMarketingSprint({ brandProfileId: 'no-such-brand', goal: 'grow' }),
    ).rejects.toThrow(/brand profile not found/i);
  });
});
