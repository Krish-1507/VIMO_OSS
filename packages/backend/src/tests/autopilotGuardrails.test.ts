/**
 * Autopilot guardrails — daily post cap + daily AI spend cap.
 *
 * These are the Phase 2 safety rails: VIMO counts what a session already
 * scheduled/published on a day and what it already spent on AI that day,
 * then refuses to go past the limits the user set at launch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Prevent the server entrypoint from booting when the agent imports `io`.
vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

// Guardrail tests never call the LLM — stub the provider chain so no network
// traffic can happen if a code path tries to.
vi.mock('../lib/llmProvider', () => ({
  callWithProviderChain: async (_task: string, _fn: unknown, fallback?: () => unknown) =>
    fallback ? (fallback as () => unknown)() : {},
}));

import { db } from '../db';
import { scheduledPosts, llmUsage, autopilotSessions } from '../db/schema';
import {
  getAutopilotPostCountOnDay,
  getAutopilotSpendToday,
  guardrailSpendAllows,
} from '../agents/autopilotAgent';

const AUTOPILOT_ID = 'autopilot-guardrail-test';

function dayOf(offsetDays = 0, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function insertPost(overrides: Partial<typeof scheduledPosts.$inferInsert> & { id: string; brandProfileId: string; content: string; platform: string; scheduledAt: string; status: string }) {
  db.insert(scheduledPosts)
    .values({
      metadataJson: JSON.stringify({ autopilotId: AUTOPILOT_ID }),
      ...overrides,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
}

beforeEach(() => {
  db.delete(scheduledPosts).run();
  db.delete(llmUsage).run();
  db.delete(autopilotSessions).run();
});

describe('getAutopilotPostCountOnDay', () => {
  it('counts only this session’s non-draft posts on the given day', async () => {
    const today = dayOf().slice(0, 10);

    insertPost({ id: crypto.randomUUID(), brandProfileId: 'b1', content: 'a', platform: 'instagram', scheduledAt: today + 'T10:00:00.000Z', status: 'published' });
    insertPost({ id: crypto.randomUUID(), brandProfileId: 'b1', content: 'b', platform: 'instagram', scheduledAt: today + 'T14:00:00.000Z', status: 'awaiting_approval' });

    // Drafts don't count — no final date assigned yet
    insertPost({ id: crypto.randomUUID(), brandProfileId: 'b1', content: 'c', platform: 'instagram', scheduledAt: today + 'T09:00:00.000Z', status: 'autopilot_draft' });
    // A different day doesn't count
    insertPost({ id: crypto.randomUUID(), brandProfileId: 'b1', content: 'd', platform: 'instagram', scheduledAt: dayOf(1).slice(0, 10) + 'T10:00:00.000Z', status: 'published' });

    expect(await getAutopilotPostCountOnDay(AUTOPILOT_ID, today)).toBe(2);
  });

  it('ignores posts from other autopilot sessions', async () => {
    const today = dayOf().slice(0, 10);
    db.insert(scheduledPosts)
      .values({
        id: crypto.randomUUID(),
        brandProfileId: 'b1',
        content: 'other',
        platform: 'instagram',
        scheduledAt: today + 'T10:00:00.000Z',
        status: 'published',
        metadataJson: JSON.stringify({ autopilotId: 'someone-else' }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    expect(await getAutopilotPostCountOnDay(AUTOPILOT_ID, today)).toBe(0);
  });
});

describe('getAutopilotSpendToday', () => {
  it('sums only today’s recorded LLM spend for this session', async () => {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const [cost, at] of [[2.5, now], [1.25, now], [99, yesterday]] as const) {
      db.insert(llmUsage)
        .values({
          id: crypto.randomUUID(),
          taskType: 'content_generation',
          provider: 'openai',
          modelId: 'gpt-4o',
          inputTokens: 100,
          outputTokens: 50,
          costUSD: cost,
          relatedEntityId: AUTOPILOT_ID,
          relatedEntityType: 'content_generation',
          createdAt: at,
        })
        .run();
    }

    expect(await getAutopilotSpendToday(AUTOPILOT_ID)).toBeCloseTo(3.75, 5);
  });
});

describe('guardrailSpendAllows', () => {
  function state(cap: number | null) {
    return {
      autopilotId: AUTOPILOT_ID,
      brandProfileId: 'b1',
      audienceDescription: '',
      primaryGoal: '',
      goalType: '',
      durationDays: 7,
      channels: ['instagram'],
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
      status: 'monitoring',
      currentPhase: '',
      trendSignals: [],
      strategyDocument: null,
      contentCalendar: null,
      scheduledPostIds: [],
      engagementEnabled: false,
      progressPercent: 100,
      log: [],
      timeline: [],
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      error: null,
      maxPostsPerDay: 5,
      spendCapPerDay: cap,
    } as any;
  }

  it('allows work when no cap is set', async () => {
    const r = await guardrailSpendAllows(state(null));
    expect(r.spendCapped).toBe(false);
  });

  it('blocks once today’s spend meets the cap', async () => {
    db.insert(llmUsage)
      .values({
        id: crypto.randomUUID(),
        taskType: 'content_generation',
        provider: 'openai',
        modelId: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        costUSD: 10,
        relatedEntityId: AUTOPILOT_ID,
        relatedEntityType: 'content_generation',
        createdAt: new Date().toISOString(),
      })
      .run();

    const r = await guardrailSpendAllows(state(10));
    expect(r.spendCapped).toBe(true);
    expect(r.message).toContain('cap');
  });

  it('allows work when spend is under the cap', async () => {
    db.insert(llmUsage)
      .values({
        id: crypto.randomUUID(),
        taskType: 'content_generation',
        provider: 'openai',
        modelId: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        costUSD: 1,
        relatedEntityId: AUTOPILOT_ID,
        relatedEntityType: 'content_generation',
        createdAt: new Date().toISOString(),
      })
      .run();

    const r = await guardrailSpendAllows(state(10));
    expect(r.spendCapped).toBe(false);
    expect(r.spendToday).toBeCloseTo(1, 5);
  });
});
