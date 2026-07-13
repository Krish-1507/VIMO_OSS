import { FastifyInstance } from 'fastify';
import { getProductionEngine } from '../server/integrations/productionEngine';
import { vimoSocialPublish } from '../services/vimoSocialPublishService';
import { getAllPlatformHealth, getAllPlatformMetrics } from '../services/platformClients';

export default async function statusRoutes(app: FastifyInstance) {
  const engine = getProductionEngine();

  /* ------------------------------------------------------------------ */
  /*  Overall System Health (excluding /api/health to avoid duplicate   */
  /*  with the main /api/health endpoint in index.ts)                   */
  /* ------------------------------------------------------------------ */
  app.get('/api/health/summary', async () => {
    const overview = await engine.getHealthOverview();
    const metrics = engine.getMetrics();
    const states = engine.getAllConnectionStates();

    return {
      status: overview.overall,
      timestamp: new Date().toISOString(),
      metrics: {
        totalConnections: metrics.totalConnections,
        activeConnections: metrics.activeConnections,
        failedConnections: metrics.failedConnections,
      },
      platforms: overview.platforms,
      packs: overview.packs,
      connections: states.map(s => ({
        platform: s.provider,
        status: s.status,
        healthScore: s.healthScore,
        lastError: s.lastErrorMessage,
      })),
    };
  });

  /* ------------------------------------------------------------------ */
  /*  Platform Health Details                                              */
  /* ------------------------------------------------------------------ */
  app.get('/api/health/platforms', async () => {
    const health = await getAllPlatformHealth();
    const metrics = await getAllPlatformMetrics();
    const states = engine.getAllConnectionStates();

    const result: Record<string, any> = {};

    for (const [platform, healthData] of Object.entries(health)) {
      const state = states.find(s => s.provider === platform);
      const metricData = metrics[platform];

      result[platform] = {
        health: healthData,
        metrics: metricData,
        state: state ? {
          status: state.status,
          healthScore: state.healthScore,
          lastError: state.lastErrorMessage,
          lastConnectedAt: state.lastConnectedAt,
        } : null,
      };
    }

    return result;
  });

  /* ------------------------------------------------------------------ */
  /*  Pack Health Details                                                  */
  /* ------------------------------------------------------------------ */
  app.get('/api/health/packs', async () => {
    const overview = await engine.getHealthOverview();
    return overview.packs;
  });

  /* ------------------------------------------------------------------ */
  /*  Test Connection                                                      */
  /* ------------------------------------------------------------------ */
  app.get('/api/health/test/:platform', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };
      const result = await engine.testConnection(platform);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Social Accounts Status                                              */
  /* ------------------------------------------------------------------ */
  app.get('/api/health/social-accounts', async () => {
    const platforms = await engine.getConnectedPlatforms();
    const accounts = await engine.getSocialAccounts();

    return {
      platforms,
      accounts: accounts.map(a => ({
        platform: a.platform,
        name: a.name,
        handle: a.handle,
        followers: a.followerCount,
        health: a.health,
        permissions: a.permissions,
      })),
    };
  });
}
