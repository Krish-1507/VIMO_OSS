/**
 * Webhook delivery retry queue — failed deliveries are queued and drained
 * with backoff until they succeed or the attempt budget runs out.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

import axios from 'axios';
import { db } from '../db';
import { appSettings, webhookEvents, webhookRetries } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  fireWebhook,
  setWebhookConfig,
  processPendingWebhookRetries,
  getPendingRetryCount,
} from '../services/webhookService';

const mockedPost = axios.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  db.delete(webhookRetries).run();
  db.delete(webhookEvents).run();
  db.delete(appSettings).run();
  mockedPost.mockReset();
});

async function setTargetDown(): Promise<void> {
  await setWebhookConfig('https://example.com/hook', 'test-secret');
  mockedPost.mockRejectedValue(new Error('ECONNREFUSED'));
}

describe('fireWebhook failure path', () => {
  it('returns delivered:false and queues a retry when the endpoint is down', async () => {
    await setTargetDown();

    const result = await fireWebhook('post_published', { postId: 'p1' });

    expect(result.delivered).toBe(false);
    expect(getPendingRetryCount()).toBe(1);

    const queued = db.select().from(webhookRetries).all();
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toBe('https://example.com/hook');
    expect(queued[0].attempts).toBe(0);
    // First retry is scheduled with the first backoff (5s) in the future.
    expect(new Date(queued[0].nextRetryAt).getTime()).toBeGreaterThan(Date.now());

    // Delivery history records the failure with the target URL visible.
    const events = db.select().from(webhookEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0].url).toBe('https://example.com/hook');
    expect(events[0].responseStatus).toBe(0);
  });

  it('signs the queued body with the configured secret', async () => {
    await setTargetDown();
    await fireWebhook('test', { hello: true });

    const queued = db.select().from(webhookRetries).all()[0];
    expect(queued.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('processPendingWebhookRetries', () => {
  it('delivers a queued retry once the endpoint recovers', async () => {
    await setTargetDown();
    await fireWebhook('post_published', { postId: 'p1' });
    expect(getPendingRetryCount()).toBe(1);

    // Make the retry due right now and bring the endpoint back up.
    const queued = db.select().from(webhookRetries).all()[0];
    db.update(webhookRetries)
      .set({ nextRetryAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(webhookRetries.id, queued.id))
      .run();
    mockedPost.mockResolvedValue({ status: 200, data: {} });

    const stats = await processPendingWebhookRetries();

    expect(stats).toMatchObject({ attempted: 1, delivered: 1, failed: 0, givenUp: 0 });
    expect(getPendingRetryCount()).toBe(0);
    // The event row is updated to the successful status.
    const event = db.select().from(webhookEvents).all()[0];
    expect(event.responseStatus).toBe(200);
  });

  it('gives up after the retry budget and marks the event failed', async () => {
    await setTargetDown();
    await fireWebhook('post_failed', { postId: 'p1' });

    // 3 retries (backoff budget), each failing, then the row is dropped.
    for (let attempt = 0; attempt < 3; attempt++) {
      const queued = db.select().from(webhookRetries).all()[0];
      db.update(webhookRetries)
        .set({ nextRetryAt: new Date(Date.now() - 1000).toISOString(), attempts: attempt })
        .where(eq(webhookRetries.id, queued.id))
        .run();
      await processPendingWebhookRetries();
    }

    expect(getPendingRetryCount()).toBe(0);

    const event = db.select().from(webhookEvents).all()[0];
    expect(event.responseBody).toContain('Gave up');
  });

  it('skips retries that are not due yet', async () => {
    await setTargetDown();
    await fireWebhook('post_published', { postId: 'p1' });

    const stats = await processPendingWebhookRetries();

    expect(stats.attempted).toBe(0);
    expect(getPendingRetryCount()).toBe(1);
  });
});
