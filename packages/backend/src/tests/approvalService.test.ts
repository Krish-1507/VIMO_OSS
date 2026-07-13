/**
 * Approval Service — the human-in-the-loop gatekeeper.
 *
 * Critical path: every autonomous publish/reply/campaign action flows through
 * requestApproval → queue → approve/reject. We exercise the decision logic for
 * all three modes, the queue read, batch approval, and the execute path.
 *
 * The DB runs in-memory (see setup.ts). The socket import (`../index`) is mocked
 * so the app never boots during tests. Only VIMO's own logic is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

import {
  requestApproval,
  approveRequest,
  rejectRequest,
  getApprovalQueue,
  getApprovalQueueCount,
  approveAllByType,
  updateApprovalSettings,
  getApprovalSettings,
  ApprovalMode,
} from '../services/approvalService';
import { db } from '../db';
import { approvalRequests, scheduledPosts, appSettings } from '../db/schema';

const BRAND = 'brand_approval_test';

function clearTables() {
  db.delete(approvalRequests).run();
  db.delete(scheduledPosts).run();
  // Reset approval settings to deterministic defaults so rules from a prior
  // test (e.g. maxAutoPostsPerDay) never leak into the next one.
  db.delete(appSettings).where(eq(appSettings.key, 'approvalMode')).run();
  db.delete(appSettings).where(eq(appSettings.key, 'approvalRules')).run();
}

describe('Approval Queue — decision logic by mode', () => {
  beforeEach(() => {
    clearTables();
    // Start from a clean, deterministic 'assisted' mode with default rules.
    updateApprovalSettings({ mode: ApprovalMode.ASSISTED });
  });

  it('SAFE mode never auto-approves anything', async () => {
    updateApprovalSettings({ mode: ApprovalMode.SAFE });
    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'hello', platform: 'instagram' },
    });
    expect(res.decision).toBe('pending');
  });

  it('ASSISTED mode auto-approves only high-confidence replies', async () => {
    const low = await requestApproval({
      requestType: 'send_reply',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'immediate',
      payload: { confidence: 40, replyText: 'thanks!' },
    });
    expect(low.decision).toBe('pending');

    const high = await requestApproval({
      requestType: 'send_reply',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'immediate',
      payload: { confidence: 95, replyText: 'thanks!' },
    });
    expect(high.decision).toBe('approved');
  });

  it('ASSISTED mode always queues publish_post for human review', async () => {
    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'launch', platform: 'instagram' },
    });
    expect(res.decision).toBe('pending');
    expect(await getApprovalQueueCount()).toBe(1);
  });

  it('AUTONOMOUS mode auto-approves a publish once first-post rule is relaxed', async () => {
    updateApprovalSettings({
      mode: ApprovalMode.AUTONOMOUS,
      rules: {
        maxAutoPostsPerDay: 5,
        requireApprovalForFirstPostOfDay: false,
        requireApprovalForPromoContent: false,
        autoApproveEngagementRepliesAboveConfidence: 85,
        blockedHours: [],
      },
    });
    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'hi', platform: 'instagram', isPromoContent: false },
    });
    expect(res.decision).toBe('approved');
  });

  it('AUTONOMOUS mode still respects the daily post cap', async () => {
    updateApprovalSettings({
      mode: ApprovalMode.AUTONOMOUS,
      rules: {
        maxAutoPostsPerDay: 1,
        requireApprovalForFirstPostOfDay: false,
        requireApprovalForPromoContent: false,
        autoApproveEngagementRepliesAboveConfidence: 85,
        blockedHours: [],
      },
    });
    await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'first', platform: 'instagram' },
    });
    const second = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'second', platform: 'instagram' },
    });
    expect(second.decision).toBe('pending');
  });
});

describe('Approval Queue — queue operations', () => {
  beforeEach(() => {
    clearTables();
    updateApprovalSettings({ mode: ApprovalMode.ASSISTED });
  });

  it('getApprovalQueue returns pending requests with a human-readable summary', async () => {
    await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'My big launch', platform: 'linkedin' },
    });
    const queue = await getApprovalQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].humanReadableSummary).toMatch(/linkedin/i);
    expect(queue[0].humanReadableSummary).toMatch(/My big launch/);
  });

  it('approveRequest marks approved and executes a publish (moves the post to pending)', async () => {
    const postId = 'post_exec_1';
    db.insert(scheduledPosts).values({
      id: postId,
      brandProfileId: BRAND,
      content: 'scheduled content',
      platform: 'instagram',
      scheduledAt: new Date().toISOString(),
      status: 'approved' as any,
      mediaUrlsJson: '[]',
      metadataJson: '{}',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { postId, content: 'scheduled content', platform: 'instagram' },
    });

    await approveRequest(res.approvalRequestId);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, res.approvalRequestId)).get();
    expect(row?.status).toBe('approved');

    const post = db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId)).get();
    expect(post?.status).toBe('pending');
  });

  it('rejectRequest marks rejected and cancels the linked post', async () => {
    const postId = 'post_reject_1';
    db.insert(scheduledPosts).values({
      id: postId,
      brandProfileId: BRAND,
      content: 'nope',
      platform: 'x',
      scheduledAt: new Date().toISOString(),
      status: 'approved' as any,
      mediaUrlsJson: '[]',
      metadataJson: '{}',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { postId, content: 'nope', platform: 'x' },
    });

    await rejectRequest(res.approvalRequestId, 'not on brand');

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, res.approvalRequestId)).get();
    expect(row?.status).toBe('rejected');
    expect(row?.rejectionReason).toBe('not on brand');

    const post = db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId)).get();
    expect(post?.status).toBe('cancelled');
  });

  it('approveAllByType approves every pending request of a type', async () => {
    for (let i = 0; i < 3; i++) {
      await requestApproval({
        requestType: 'start_campaign',
        brandProfileId: BRAND,
        requestedBy: 'user',
        urgency: 'low',
        payload: { campaignId: `c${i}` },
      });
    }
    const n = await approveAllByType('start_campaign');
    expect(n).toBe(3);
    expect(await getApprovalQueueCount()).toBe(0);
  });

  it('getApprovalSettings returns the configured mode and rules', async () => {
    const settings = await getApprovalSettings();
    expect(settings.mode).toBe('assisted');
    expect(settings.rules.maxAutoPostsPerDay).toBe(5);
  });
});

describe('Approval Queue — decision-rule branch coverage', () => {
  beforeEach(() => {
    clearTables();
    updateApprovalSettings({ mode: ApprovalMode.ASSISTED });
  });

  it('ASSISTED send_reply auto-approves at the confidence threshold but queues just below it', async () => {
    const at = await requestApproval({
      requestType: 'send_reply',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'immediate',
      payload: { confidence: 85, replyText: 'thanks!' },
    });
    expect(at.decision).toBe('approved');

    const justBelow = await requestApproval({
      requestType: 'send_reply',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'immediate',
      payload: { confidence: 84, replyText: 'thanks!' },
    });
    expect(justBelow.decision).toBe('pending');
  });

  it('AUTONOMOUS publish with promo content stays pending', async () => {
    updateApprovalSettings({
      mode: ApprovalMode.AUTONOMOUS,
      rules: {
        maxAutoPostsPerDay: 5,
        requireApprovalForFirstPostOfDay: false,
        requireApprovalForPromoContent: true,
        autoApproveEngagementRepliesAboveConfidence: 85,
        blockedHours: [],
      },
    });
    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'Buy now', platform: 'instagram', isPromoContent: true },
    });
    expect(res.decision).toBe('pending');
  });

  it('AUTONOMOUS publish is blocked during blocked hours', async () => {
    updateApprovalSettings({
      mode: ApprovalMode.AUTONOMOUS,
      rules: {
        maxAutoPostsPerDay: 5,
        requireApprovalForFirstPostOfDay: false,
        requireApprovalForPromoContent: false,
        autoApproveEngagementRepliesAboveConfidence: 85,
        blockedHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      },
    });
    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { content: 'hi', platform: 'instagram' },
    });
    expect(res.decision).toBe('pending');
  });

  it('AUTONOMOUS start_campaign always stays pending', async () => {
    updateApprovalSettings({
      mode: ApprovalMode.AUTONOMOUS,
      rules: {
        maxAutoPostsPerDay: 5,
        requireApprovalForFirstPostOfDay: false,
        requireApprovalForPromoContent: false,
        autoApproveEngagementRepliesAboveConfidence: 85,
        blockedHours: [],
      },
    });
    const res = await requestApproval({
      requestType: 'start_campaign',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'low',
      payload: { campaignId: 'c1', campaignName: 'Spring' },
    });
    expect(res.decision).toBe('pending');
  });

  it('AUTONOMOUS send_reply below confidence stays pending', async () => {
    updateApprovalSettings({
      mode: ApprovalMode.AUTONOMOUS,
      rules: {
        maxAutoPostsPerDay: 5,
        requireApprovalForFirstPostOfDay: false,
        requireApprovalForPromoContent: false,
        autoApproveEngagementRepliesAboveConfidence: 85,
        blockedHours: [],
      },
    });
    const res = await requestApproval({
      requestType: 'send_reply',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'immediate',
      payload: { confidence: 50, replyText: 'hi' },
    });
    expect(res.decision).toBe('pending');
  });

  it('approving a publish_post executes and moves the linked post to pending', async () => {
    const postId = 'post_exec_branch';
    db.insert(scheduledPosts)
      .values({
        id: postId,
        brandProfileId: BRAND,
        content: 'x',
        platform: 'instagram',
        scheduledAt: new Date().toISOString(),
        status: 'approved' as any,
        mediaUrlsJson: '[]',
        metadataJson: '{}',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    const res = await requestApproval({
      requestType: 'publish_post',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'scheduled',
      payload: { postId, content: 'x', platform: 'instagram' },
    });
    await approveRequest(res.approvalRequestId);

    const post = db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId)).get();
    expect(post?.status).toBe('pending');
  });

  it('approving a start_campaign request runs the campaign execute branch', async () => {
    const res = await requestApproval({
      requestType: 'start_campaign',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'low',
      payload: { campaignId: 'missing', campaignName: 'Demo' },
    });
    await approveRequest(res.approvalRequestId);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, res.approvalRequestId)).get();
    expect(row?.status).toBe('approved');
  });

  it('approving a send_reply request runs the reply execute branch', async () => {
    updateApprovalSettings({
      mode: ApprovalMode.AUTONOMOUS,
      rules: {
        maxAutoPostsPerDay: 5,
        requireApprovalForFirstPostOfDay: false,
        requireApprovalForPromoContent: false,
        autoApproveEngagementRepliesAboveConfidence: 85,
        blockedHours: [],
      },
    });
    const res = await requestApproval({
      requestType: 'send_reply',
      brandProfileId: BRAND,
      requestedBy: 'user',
      urgency: 'immediate',
      payload: { confidence: 50, replyText: 'thanks', commentId: 'c1', engagementItemId: 'e1' },
    });
    await approveRequest(res.approvalRequestId);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, res.approvalRequestId)).get();
    expect(row?.status).toBe('approved');
  });
});
