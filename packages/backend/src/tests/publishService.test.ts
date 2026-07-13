/**
 * Publish Service — provider-agnostic router.
 *
 * publishService is the layer that routes every publish/schedule call through
 * the VIMO Social integration. This test mocks the VIMO Social layer (the real
 * API boundary) and asserts the *routing* logic VIMO owns: single vs multi
 * platform, success vs friendly-error mapping, and scheduling/health pass-through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { vimoSocialPublish } = vi.hoisted(() => {
  const vimoSocialPublish = {
    publish: vi.fn(),
    schedule: vi.fn(),
    healthCheck: vi.fn(),
  };
  return { vimoSocialPublish };
});

vi.mock('../services/vimoSocialPublishService', () => ({ vimoSocialPublish }));

import {
  publishToPlatform,
  schedulePublish,
  publishToMultiplePlatforms,
  checkPublishHealth,
} from '../services/publishService';

beforeEach(() => {
  vimoSocialPublish.publish.mockReset();
  vimoSocialPublish.schedule.mockReset();
  vimoSocialPublish.healthCheck.mockReset();
});

describe('publishToPlatform — single platform routing', () => {
  it('routes to VIMO Social and returns the platform result on success', async () => {
    vimoSocialPublish.publish.mockResolvedValue({
      success: true,
      platformResults: { instagram: { success: true, platformPostId: 'IG123' } },
    });

    const res = await publishToPlatform({
      postId: 'p1',
      content: 'hello',
      platform: 'instagram',
      mediaUrls: ['https://img/x.jpg'],
    });

    expect(res.success).toBe(true);
    expect(res.platformPostId).toBe('IG123');
    expect(vimoSocialPublish.publish).toHaveBeenCalledWith({
      postId: 'p1',
      content: 'hello',
      platforms: ['instagram'],
      mediaUrls: ['https://img/x.jpg'],
      metadata: undefined,
    });
  });

  it('maps a token error into a friendly, token-free message', async () => {
    vimoSocialPublish.publish.mockResolvedValue({
      success: false,
      platformResults: { linkedin: { success: false, error: 'oauth token expired 401' } },
    });

    const res = await publishToPlatform({
      postId: 'p2',
      content: 'hi',
      platform: 'linkedin',
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/reconnect/i);
    expect(res.error).not.toMatch(/token/i);
  });

  it('falls back to a generic friendly message when no platform result exists', async () => {
    vimoSocialPublish.publish.mockResolvedValue({
      success: false,
      platformResults: {},
    });
    const res = await publishToPlatform({ postId: 'p3', content: 'x', platform: 'facebook' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Facebook/);
  });

  it('surfaces a thrown error as a friendly failure (never crashes the caller)', async () => {
    vimoSocialPublish.publish.mockRejectedValue(new Error('network down'));
    const res = await publishToPlatform({ postId: 'p4', content: 'x', platform: 'x' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/X/);
  });
});

describe('schedulePublish — scheduling pass-through', () => {
  it('schedules via VIMO Social and returns the platform result', async () => {
    vimoSocialPublish.schedule.mockResolvedValue({
      success: true,
      platformResults: { instagram: { success: true, platformPostId: 'SCHED1' } },
    });
    const res = await schedulePublish({
      postId: 'p5',
      content: 'later',
      platform: 'instagram',
      scheduledAt: '2099-01-01T00:00:00Z',
    });
    expect(res.success).toBe(true);
    expect(res.platformPostId).toBe('SCHED1');
    expect(vimoSocialPublish.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: '2099-01-01T00:00:00Z' }),
    );
  });
});

describe('publishToMultiplePlatforms — aggregate routing', () => {
  it('returns per-platform results and an allSuccess flag', async () => {
    vimoSocialPublish.publish.mockResolvedValue({
      success: false,
      platformResults: {
        instagram: { success: true, platformPostId: 'IG1' },
        x: { success: false, error: 'rate limited 429' },
      },
    });

    const { results, allSuccess } = await publishToMultiplePlatforms(
      'p6',
      'cross post',
      ['instagram', 'x'],
    );

    expect(results.instagram.success).toBe(true);
    expect(results.x.success).toBe(false);
    expect(allSuccess).toBe(false);
  });
});

describe('checkPublishHealth — pass-through', () => {
  it('returns the VIMO Social health status', async () => {
    vimoSocialPublish.healthCheck.mockResolvedValue({ connected: true, message: '2 active' });
    const health = await checkPublishHealth();
    expect(health).toEqual({ connected: true, message: '2 active' });
  });
});
