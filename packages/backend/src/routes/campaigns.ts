import { FastifyInstance } from 'fastify';
import {
  createCampaign,
  startCampaign,
  getCampaigns,
  getCampaignDetail,
  approveCampaign,
  rejectCampaign,
  deleteCampaign,
  previewCampaign,
  getCampaignPerformanceSummary,
} from '../services/campaignService';
import { db } from '../db';
import { formatError } from '../lib/errorFormatter';

export default async function campaignRoutes(app: FastifyInstance) {
  // GET /api/campaigns
  app.get('/api/campaigns', async (request, reply) => {
    try {
      return await getCampaigns();
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/campaigns/:id
  app.get('/api/campaigns/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const campaign = await getCampaignDetail(id);
      return campaign;
    } catch (err) {
      return reply.status(404).send(formatError(err));
    }
  });

  // POST /api/campaigns/preview
  app.post('/api/campaigns/preview', async (request, reply) => {
    try {
      const body = request.body as {
        goal: string;
        brandProfileId: string;
        goalAnswers?: Record<string, string>;
        durationDays: number;
      };

      const preview = await previewCampaign(body);
      return reply.status(200).send(preview);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/campaigns
  app.post('/api/campaigns', async (request, reply) => {
    try {
      const body = request.body as {
        name: string;
        goal: string;
        brandProfileId: string;
        channels: string[];
        startDate: string;
        endDate: string;
      };

      const campaign = await createCampaign(body);
      return reply.status(201).send(campaign);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/campaigns/:id/start
  app.post('/api/campaigns/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { requiresHumanApproval?: boolean };

    try {
      await startCampaign(id, {
        requiresHumanApproval: body.requiresHumanApproval ?? true,
      });
      return reply.status(202).send({
        message: 'Campaign agent started',
        campaignId: id,
      });
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/campaigns/:id/approve
  app.post('/api/campaigns/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await approveCampaign(id);
      return { message: 'Campaign approved', campaignId: id };
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/campaigns/:id/reject
  app.post('/api/campaigns/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await rejectCampaign(id);
      return { message: 'Campaign rejected', campaignId: id };
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/campaigns/:id/performance
  app.get('/api/campaigns/:id/performance', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const summary = await getCampaignPerformanceSummary(id);
      return summary;
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/campaigns/:id/complete — mark campaign as completed and trigger Marketing Director
  app.post('/api/campaigns/:id/complete', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { eq } = await import('drizzle-orm');
      const { campaigns: campaignsTable } = await import('../db/schema');
      const campaign = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id)).get();
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      await db
        .update(campaignsTable)
        .set({ status: 'completed', updatedAt: new Date().toISOString() })
        .where(eq(campaignsTable.id, id))
        .run();

      // Record campaign_completed to marketing memory
      setImmediate(async () => {
        try {
          const { recordMemoryEntry } = await import('../services/memoryTimelineService');
          const { getCampaignPerformanceSummary } = await import('../services/campaignService');
          const summary = await getCampaignPerformanceSummary(id);
          await recordMemoryEntry({
            brandProfileId: campaign.brandProfileId,
            entryType: 'campaign_completed',
            entryDate: new Date().toISOString(),
            weekLabel: '',
            summary: `Campaign completed: ${campaign.name}`,
            metrics: {
              avgEngagementRate: summary.avgEngagementRate,
              followerGrowth: summary.followerGrowthDuringCampaign,
              totalReach: summary.totalReach,
              totalEngagements: summary.totalEngagements,
            },
            sentiment: summary.avgEngagementRate > 3 ? 'positive' : 'neutral',
            tags: ['campaign', 'completed', summary.topPost?.platform || 'instagram'],
            linkedEntityId: id,
            linkedEntityType: 'campaign',
            lessonsJson: [summary.aiSummary],
          });
        } catch { /* ignore */ }
      });

      // Trigger Marketing Director
      setImmediate(async () => {
        try {
          const { runMarketingDirector } = await import('../agents/marketingDirector');
          await runMarketingDirector({
            brandProfileId: campaign.brandProfileId,
            trigger: 'campaign_completed',
          });
        } catch (dirErr) {
          console.warn('[Campaigns] Failed to trigger Marketing Director:', (dirErr as Error).message);
        }
      });

      return { success: true, message: 'Campaign completed. Marketing Director is analyzing results.' };
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });

  // DELETE /api/campaigns/:id
  app.delete('/api/campaigns/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteCampaign(id);
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send(formatError(err));
    }
  });
}
