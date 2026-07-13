/**
 * MCP Routes — Intelligence source workflows and system health.
 */
import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { eq, and, gte, lte } from 'drizzle-orm';
import { connectors, scheduledPosts, autopilotSessions, appSettings, approvalRequests } from '../db/schema';
import { PRESET_CONNECTORS } from '../connectors/presets';
import { formatError } from '../lib/errorFormatter';
import { generateWeeklyContentFromMCPSources } from '../services/mcpWorkflowService';
import { getSchedulerStatus } from '../services/schedulerService';
import cron from 'node-cron';

export default async function mcpRoutes(app: FastifyInstance) {
  // POST /api/mcp/generate-weekly — Generate this week's marketing from MCP sources
  app.post('/api/mcp/generate-weekly', async (request, reply) => {
    try {
      const { brandProfileId } = request.body as { brandProfileId?: string };

      // Get the default brand profile if none provided
      let effectiveBrandProfileId = brandProfileId;
      if (!effectiveBrandProfileId) {
        const bp = db.select().from(connectors).where(eq(connectors.id, '__default__')).get();
        // Try to find any brand profile
        const { brandProfiles } = await import('../db/schema');
        const profiles = db.select().from(brandProfiles).all();
        if (profiles.length > 0) {
          effectiveBrandProfileId = profiles[0].id;
        } else {
          return reply.status(400).send({ error: 'No brand profile found. Create a brand profile first.' });
        }
      }

      const result = await generateWeeklyContentFromMCPSources(effectiveBrandProfileId);
      return result;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/system/status — Comprehensive health report
  app.get('/api/system/status', async (request, reply) => {
    try {
      // Backend status
      const backendStatus = 'ok';

      // Database status
      let dbStatus = 'error';
      try {
        await db.select().from(appSettings).limit(1).get();
        dbStatus = 'ok';
      } catch { /* db error */ }

      // Active LLM connector
      let allConnectors: any[] = [];
      let activeLLM: any = null;
      try {
        allConnectors = db.select().from(connectors).all();
        activeLLM = allConnectors.find((c) => c.type === 'llm' && c.status === 'active');
      } catch { /* table may not exist */ }

      // Active native connectors (social platforms)
      let activeNativeConnectors = 0;
      try {
        const nativePresets = PRESET_CONNECTORS.filter((p) => p.connectorArchitecture === 'native');
        const nativeProviderIds = new Set(nativePresets.map((p) => p.provider));
        activeNativeConnectors = allConnectors.filter(
          (c) => c.status === 'active' && nativeProviderIds.has(c.provider)
        ).length;
      } catch { /* ignore */ }

      // Active MCP connectors
      let activeMCPConnectors = 0;
      try {
        const mcpPresets = PRESET_CONNECTORS.filter((p) => p.connectorArchitecture === 'mcp');
        const mcpProviderIds = new Set(mcpPresets.map((p) => p.provider));
        activeMCPConnectors = allConnectors.filter(
          (c) => c.status === 'active' && mcpProviderIds.has(c.provider)
        ).length;
      } catch { /* ignore */ }

      // Pending posts
      let pendingPosts = 0;
      try {
        pendingPosts = db
          .select()
          .from(scheduledPosts)
          .where(eq(scheduledPosts.status, 'pending'))
          .all()
          .length;
      } catch { /* table may not exist */ }

      // Active autopilots
      let activeAutopilots = 0;
      try {
        activeAutopilots = db
          .select()
          .from(autopilotSessions)
          .where(eq(autopilotSessions.status, 'monitoring'))
          .all()
          .length;
      } catch { /* table may not exist */ }

      // Approval queue count
      let pendingApprovals = 0;
      try {
        pendingApprovals = db
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.status, 'pending'))
          .all()
          .length;
      } catch {
        // Table may not exist yet
        pendingApprovals = 0;
      }

      // Model assignments count
      const modelAssignmentsRow = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'modelAssignments'))
        .get();
      let modelAssignmentsCount = 0;
      if (modelAssignmentsRow) {
        try {
          const parsed = JSON.parse(modelAssignmentsRow.value);
          if (typeof parsed === 'object' && parsed !== null) {
            modelAssignmentsCount = Object.keys(parsed).length;
          }
        } catch {
          modelAssignmentsCount = 0;
        }
      }

      // Scheduler mode
      const schedulerStatus = getSchedulerStatus();

      // Last cron runs (tracked via app_settings)
      const lastCronRuns: Record<string, string> = {};
      const cronKeys = [
        'cron_last_post_performance',
        'cron_last_growth_loop',
        'cron_last_engagement',
        'cron_last_account_snapshot',
        'cron_last_trend_hunter',
        'cron_last_content_dna',
        'cron_last_connector_health',
      ];
      for (const key of cronKeys) {
        const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
        lastCronRuns[key.replace('cron_last_', '')] = row?.value || 'never';
      }

      return {
        backend: backendStatus,
        database: dbStatus,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        activeLLMConnector: activeLLM?.name || null,
        activeNativeConnectors,
        activeMCPConnectors,
        pendingPosts,
        activeAutopilots,
        pendingApprovals,
        modelAssignmentsCount,
        schedulerMode: schedulerStatus.mode,
        lastCronRun: lastCronRuns,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
