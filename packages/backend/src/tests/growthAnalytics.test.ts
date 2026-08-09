/**
 * Growth-loop analytics — ranks published posts by real engagement data
 * stored in post metadata and produces a human-readable summary.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import { analyzeTopPerformingContent } from '../services/growthLoopService';

const BRAND_ID = 'brand-growth-test';

function insertPost(overrides: Partial<typeof scheduledPosts.$inferInsert> & { id: string; content: string; platform: string; scheduledAt: string; status: string }) {
  db.insert(scheduledPosts)
    .values({
      brandProfileId: BRAND_ID,
      metadataJson: JSON.stringify({}),
      ...overrides,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
}

function published(id: string, content: string, platform: string, engagementRate: number, topic: string) {
  insertPost({
    id,
    brandProfileId: BRAND_ID,
    content,
    platform,
    scheduledAt: new Date().toISOString(),
    status: 'published',
    metadataJson: JSON.stringify({ performance: { engagementRate }, topic }),
  });
}

beforeEach(() => {
  db.delete(scheduledPosts).run();
});

describe('analyzeTopPerformingContent', () => {
  it('ranks published posts by engagement rate and returns top topics', async () => {
    published('p1', 'Low engagement post', 'instagram', 1.2, 'Behind the scenes');
    published('p2', 'Banger post', 'tiktok', 9.8, 'Tutorial');
    published('p3', 'Mid post', 'linkedin', 4.4, 'Industry insights');

    const result = await analyzeTopPerformingContent(BRAND_ID);

    expect(result.topPostTopics).toEqual(['Tutorial', 'Industry insights', 'Behind the scenes']);
    expect(result.summary).toContain('Tutorial');
    expect(result.summary).toContain('9.8%');
  });

  it('ignores non-published posts and posts without engagement data', async () => {
    published('p1', 'A', 'instagram', 7.5, 'Topic A');
    insertPost({
      id: 'p2',
      brandProfileId: BRAND_ID,
      content: 'Draft',
      platform: 'instagram',
      scheduledAt: new Date().toISOString(),
      status: 'autopilot_draft',
    });
    insertPost({
      id: 'p3',
      brandProfileId: BRAND_ID,
      content: 'Published but no metrics yet',
      platform: 'instagram',
      scheduledAt: new Date().toISOString(),
      status: 'published',
      metadataJson: JSON.stringify({}),
    });

    const result = await analyzeTopPerformingContent(BRAND_ID);

    expect(result.topPostTopics).toEqual(['Topic A']);
  });

  it('returns an honest empty result when nothing has performance data', async () => {
    insertPost({
      id: 'p1',
      brandProfileId: BRAND_ID,
      content: 'Fresh post',
      platform: 'instagram',
      scheduledAt: new Date().toISOString(),
      status: 'published',
    });

    const result = await analyzeTopPerformingContent(BRAND_ID);

    expect(result.topPostTopics).toEqual([]);
    expect(result.summary).toContain('No performance data yet');
  });

  it('does not crash on malformed metadata JSON', async () => {
    insertPost({
      id: 'p1',
      brandProfileId: BRAND_ID,
      content: 'Broken meta',
      platform: 'instagram',
      scheduledAt: new Date().toISOString(),
      status: 'published',
      metadataJson: '{not-json',
    });

    const result = await analyzeTopPerformingContent(BRAND_ID);

    expect(result.topPostTopics).toEqual([]);
  });
});
