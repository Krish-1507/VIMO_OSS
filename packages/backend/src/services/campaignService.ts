import { eq } from 'drizzle-orm';
import { db } from '../db';
import { campaigns, scheduledPosts, agentLogs } from '../db/schema';
import { runCampaignAgent, resumeCampaignAgent } from '../agents/campaignAgent';
import { translateGoalToStrategy, type GoalTranslationResult } from '../agents/goalTranslationAgent';

export interface Campaign {
  id: string;
  name: string;
  goal: string;
  status: string;
  brandProfileId: string;
  channels: string[];
  startDate: string;
  endDate: string;
  strategy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createCampaign(data: {
  name: string;
  goal: string;
  brandProfileId: string;
  channels: string[];
  startDate: string;
  endDate: string;
}): Promise<Campaign> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record = {
    id,
    name: data.name,
    goal: data.goal,
    status: 'draft',
    brandProfileId: data.brandProfileId,
    channelsJson: JSON.stringify(data.channels),
    startDate: data.startDate,
    endDate: data.endDate,
    strategy: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(campaigns).values(record);

  return {
    ...record,
    channels: data.channels,
    strategy: null,
  };
}

export async function startCampaign(
  campaignId: string,
  options: { requiresHumanApproval: boolean }
): Promise<void> {
  const campaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get();

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const channels = JSON.parse(campaign.channelsJson) as string[];

  // Record campaign_started memory entry
  const now = new Date().toISOString();
  setImmediate(async () => {
    try {
      const { recordMemoryEntry } = await import('./memoryTimelineService');
      await recordMemoryEntry({
        brandProfileId: campaign.brandProfileId,
        entryType: 'campaign_started',
        entryDate: now,
        weekLabel: '',
        summary: `Campaign started: ${campaign.name} (${channels.join(', ')})`,
        metrics: {
          channels,
          goal: campaign.goal,
          durationDays: Math.ceil((new Date(campaign.endDate || campaign.startDate).getTime() - new Date(campaign.startDate).getTime()) / (1000 * 60 * 60 * 24)),
        },
        sentiment: 'neutral',
        tags: ['campaign', ...channels],
        linkedEntityId: campaignId,
        linkedEntityType: 'campaign',
        lessonsJson: null,
      });
    } catch { /* ignore */ }

    // Translate the goal into a funnel strategy before running the agent
    let funnelPlan: Record<number, string> | null = null;
    let goalType: string | null = null;
    let refinedGoal: string | null = null;
    try {
      const durationDays = Math.max(1, Math.ceil(
        (new Date(campaign.endDate || campaign.startDate).getTime() - new Date(campaign.startDate).getTime()) / (1000 * 60 * 60 * 24)
      ));
      const strategy = await translateGoalToStrategy({
        userGoal: campaign.goal,
        brandProfileId: campaign.brandProfileId,
        durationDays,
      });
      funnelPlan = strategy.funnelPlan;
      goalType = strategy.goalType;
      refinedGoal = strategy.refinedGoal;
    } catch {
      // Fallback: proceed without funnel plan
    }

    // Request approval before running the campaign agent
    try {
      const { requestApproval } = await import('./approvalService');
      const approvalResult = await requestApproval({
        requestType: 'start_campaign',
        payload: {
          campaignId,
          campaignName: campaign.name,
          brandProfileId: campaign.brandProfileId,
          requiresHumanApproval: options.requiresHumanApproval,
        },
        brandProfileId: campaign.brandProfileId,
        requestedBy: 'campaign_service',
        urgency: 'immediate',
      });

      if (approvalResult.decision === 'pending') {
        // Campaign agent still runs to prepare content, but final scheduling will also go through approval
        console.log(`[CampaignService] Campaign ${campaignId} awaiting approval. Agent will prepare content.`);
      }
    } catch {
      // If approval service fails, proceed with campaign
    }

    try {
      await runCampaignAgent({
        campaignId,
        goal: campaign.goal,
        brandProfileId: campaign.brandProfileId,
        channels,
        startDate: campaign.startDate,
        endDate: campaign.endDate || campaign.startDate,
        requiresHumanApproval: options.requiresHumanApproval,
        funnelPlan,
        goalType,
        refinedGoal,
      });
    } catch (err) {
      console.error(`[CampaignAgent] Failed for ${campaignId}:`, err);
      await db
        .update(campaigns)
        .set({
          status: 'error',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(campaigns.id, campaignId))
        .run();
    }
  });
}

export async function getCampaigns(): Promise<Campaign[]> {
  const rows = await db.select().from(campaigns).all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    goal: row.goal,
    status: row.status,
    brandProfileId: row.brandProfileId,
    channels: JSON.parse(row.channelsJson),
    startDate: row.startDate,
    endDate: row.endDate || row.startDate,
    strategy: row.strategy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getCampaignDetail(
  id: string
): Promise<
  Campaign & {
    posts: Array<{
      id: string;
      platform: string;
      content: string;
      scheduledAt: string;
      status: string;
    }>;
    logs: Array<{
      id: string;
      agentType: string;
      action: string;
      output: string;
      status: string;
      createdAt: string;
    }>;
  }
> {
  const row = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!row) {
    throw new Error(`Campaign ${id} not found`);
  }

  const posts = await db
    .select()
    .from(scheduledPosts)
    .where(eq(scheduledPosts.campaignId, id))
    .all();

  const logs = await db
    .select()
    .from(agentLogs)
    .where(eq(agentLogs.agentType, 'campaign'))
    .all();

  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    status: row.status,
    brandProfileId: row.brandProfileId,
    channels: JSON.parse(row.channelsJson),
    startDate: row.startDate,
    endDate: row.endDate || row.startDate,
    strategy: row.strategy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    posts: posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      content: p.content,
      scheduledAt: p.scheduledAt,
      status: p.status,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      agentType: l.agentType,
      action: l.action,
      output: l.output,
      status: l.status,
      createdAt: l.createdAt,
    })),
  };
}

export async function approveCampaign(campaignId: string): Promise<void> {
  await resumeCampaignAgent(campaignId, true);
}

export async function rejectCampaign(campaignId: string): Promise<void> {
  await resumeCampaignAgent(campaignId, false);
}

export async function previewCampaign(params: {
  goal: string;
  brandProfileId: string;
  goalAnswers?: Record<string, string>;
  durationDays: number;
}): Promise<GoalTranslationResult> {
  return translateGoalToStrategy({
    userGoal: params.goal,
    brandProfileId: params.brandProfileId,
    durationDays: params.durationDays,
    goalAnswers: params.goalAnswers,
  });
}

export async function getCampaignPerformanceSummary(campaignId: string): Promise<{
  totalReach: number;
  totalEngagements: number;
  avgEngagementRate: number;
  topPost: { content: string; platform: string; reach: number; engagements: number } | null;
  followerGrowthDuringCampaign: number;
  aiSummary: string;
}> {
  const row = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!row) throw new Error(`Campaign ${campaignId} not found`);

  const posts = await db
    .select()
    .from(scheduledPosts)
    .where(
      eq(scheduledPosts.campaignId, campaignId)
    )
    .all();

  const publishedPosts = posts.filter((p) => p.status === 'published');

  let totalReach = 0;
  let totalEngagements = 0;
  let topPost: { content: string; platform: string; reach: number; engagements: number } | null = null;
  let topPostEngagements = -1;

  for (const post of publishedPosts) {
    const metadata = post.metadataJson ? JSON.parse(post.metadataJson) : {};
    const perf = metadata.performance || {};
    const reach = perf.reach ?? 0;
    const engagements = (perf.likes ?? 0) + (perf.comments ?? 0) + (perf.saves ?? 0) + (perf.shares ?? 0);
    totalReach += reach;
    totalEngagements += engagements;

    if (engagements > topPostEngagements) {
      topPostEngagements = engagements;
      topPost = { content: post.content.substring(0, 120), platform: post.platform, reach, engagements };
    }
  }

  const avgEngagementRate = totalReach > 0 ? (totalEngagements / totalReach) * 100 : 0;

  // Follower growth during campaign (best-effort)
  let followerGrowthDuringCampaign = 0;
  try {
    const { getFollowerGrowth } = await import('./accountSnapshotService');
    const startDate = new Date(row.startDate);
    const endDate = row.endDate ? new Date(row.endDate) : new Date();
    const daysDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    // Try to find the connector for this brand's Instagram
    const { ConnectorRegistry } = await import('../lib/connectorRegistry');
    const registry = new ConnectorRegistry(db);
    const allConnectors = await registry.getAll();
    const igConnector = allConnectors.find((c) => c.provider === 'instagram' && c.status === 'active');
    if (igConnector) {
      const growth = await getFollowerGrowth(igConnector.id, daysDiff);
      followerGrowthDuringCampaign = growth.change;
    }
  } catch {
    // Ignore — follower data may not be available
  }

  // Generate AI summary
  let aiSummary = '';
  try {
    const { callWithProviderChain } = await import('../lib/llmProvider');
    const { generateText } = await import('ai');
    const durationDays = row.endDate
      ? Math.ceil((new Date(row.endDate).getTime() - new Date(row.startDate).getTime()) / (1000 * 60 * 60 * 24))
      : 7;
    const prompt = `Write a 2-3 sentence campaign performance summary for a ${durationDays}-day campaign called "${row.name}". Goal: ${row.goal}. Total reach: ${totalReach}. Total engagements: ${totalEngagements}. Published posts: ${publishedPosts.length}. Avg engagement rate: ${avgEngagementRate.toFixed(1)}%. Top performing content type: ${topPost?.platform || 'N/A'}. Follower growth: +${followerGrowthDuringCampaign}. Write it in plain English for a non-technical business owner.`;
    aiSummary = await callWithProviderChain(
      'analytics insights',
      async (provider, modelId) => {
        const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
        return t;
      },
      () => `This ${durationDays}-day campaign reached ${totalReach} people with ${publishedPosts.length} published posts. The average engagement rate was ${avgEngagementRate.toFixed(1)}%.`
    );
  } catch {
    aiSummary = `This ${row.endDate ? Math.ceil((new Date(row.endDate).getTime() - new Date(row.startDate).getTime()) / (1000 * 60 * 60 * 24)) : 7}-day campaign reached ${totalReach} people with ${publishedPosts.length} published posts. The average engagement rate was ${avgEngagementRate.toFixed(1)}%.`;
  }

  return {
    totalReach,
    totalEngagements,
    avgEngagementRate,
    topPost,
    followerGrowthDuringCampaign,
    aiSummary,
  };
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  await db.delete(campaigns).where(eq(campaigns.id, campaignId)).run();
}
