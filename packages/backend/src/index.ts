import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';
import dotenv from 'dotenv';
import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import { db } from './db';
import authRoutes from './routes/auth';
import connectorRoutes from './routes/connectors';
import brandProfileRoutes from './routes/brandProfiles';
import settingsRoutes from './routes/settings';
import userProfileRoutes from './routes/userProfiles';
import scheduledPostsRoutes from './routes/scheduledPosts';
import campaignRoutes from './routes/campaigns';
import viralStudioRoutes from './routes/viralStudio';
import analyticsRoutes from './routes/analytics';
import engagementRoutes from './routes/engagement';
import integrationsRoutes from './routes/integrations';
import pluginRoutes from './routes/plugins';
import mediaRoutes from './routes/media';
import canvaRoutes from './routes/canva';
import reelsScriptRoutes from './routes/reelsScript';
import notificationRoutes from './routes/notifications';
import growthActionsRoutes from './routes/growthActions';
import intelligenceRoutes from './routes/intelligence';
import brandMemoryRoutes from './routes/brandMemory';
import roastRoutes from './routes/roast';
import assistantRoutes from './routes/assistant';
import mcpRoutes from './routes/mcp';
import directorRoutes from './routes/director';
import approvalRoutes from './routes/approvals';
import memoryRoutes from './routes/memory';
import oauthRoutes from './routes/oauth';
import simpleOAuthRoutes from './routes/simpleOAuth';
import canvaIntegrationRoutes from './routes/canvaIntegration';
import usageRoutes from './routes/usage';
import higgsfieldRoutes from './routes/higgsfield';
import opportunityRoutes from './routes/opportunities';
import knowledgeGraphRoutes from './routes/knowledgeGraph';
import { requireAuth } from './middleware/auth';
import { formatError } from './lib/errorFormatter';
import { appSettings } from './db/schema';
import { initScheduler } from './services/schedulerService';
import { initViralStudioProcessing } from './services/viralStudioService';
import { refreshPostPerformance } from './services/performanceTrackerService';
import { runGrowthLoopForAllBrands } from './services/growthLoopService';
import { runEngagementPipelineForAllConnectors } from './services/engagementPollingService';
import { rescueMissedPosts } from './services/schedulerService';
import { initConnectorHealthCron } from './services/connectorHealthService';
import { runMarketingDirector } from './agents/marketingDirector';
import packInsightsRoutes from './routes/packInsights';
import socialAccountsRoutes from './routes/socialAccounts';
import contentLibraryRoutes from './routes/contentLibrary';
import statusRoutes from './routes/status';
import activityRoutes from './routes/activity';
import connectionsRoutes from './routes/connections';
import packConnectionsRoutes from './routes/packConnections';
import cron from 'node-cron';

let io: Server;

async function ensureEnvFile() {
  const envPath = path.resolve(process.cwd(), '../../.env');
  const examplePath = path.resolve(process.cwd(), '../../.env.example');
  const placeholder = 'change-this-to-a-random-32-character-string';

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(examplePath)) {
      let content = fs.readFileSync(examplePath, 'utf8');
      const newKey = crypto.randomBytes(32).toString('hex');
      content = content.replace(placeholder, newKey);
      fs.writeFileSync(envPath, content);
      console.log('\x1b[32m%s\x1b[0m', 'VIMO: Created .env file with a secure encryption key automatically.');
    }
  } else {
    let content = fs.readFileSync(envPath, 'utf8');
    if (content.includes(placeholder)) {
      const newKey = crypto.randomBytes(32).toString('hex');
      content = content.replace(placeholder, newKey);
      fs.writeFileSync(envPath, content);
      console.warn('VIMO: Updated your .env file with a secure encryption key.');
    }
  }
  dotenv.config({ path: envPath });
}

/**
 * NOTE:
 * Previously this service auto-probed and switched to another available port,
 * and then tried to "sync" that port into the frontend source.
 *
 * This is brittle because the frontend dev server proxy target is static.
 * If the backend chooses a different port than the one the frontend proxies to,
 * API calls fail with "Setup failed. Is the backend server running?"
 *
 * The backend must always bind to the configured PORT (default: 3000).
 */

async function main() {
  await ensureEnvFile();

  const NODE_ENV = process.env.NODE_ENV || 'development';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const FRONTEND_URL_ALT = 'http://localhost:5174';

  const app: FastifyInstance = fastify({
    logger: NODE_ENV === 'development',
  });

  io = new Server(app.server, {
    cors: {
      origin: [FRONTEND_URL, FRONTEND_URL_ALT],
    },
  });

  io.on('connection', (socket) => {
    app.log.info(`Socket client connected: ${socket.id}`);
    socket.emit('welcome', { message: 'VIMO backend connected' });
  });

  const finalPort = Number(process.env.PORT ?? '3000');
  process.env.PORT = finalPort.toString();

  await app.register(cors, {
    origin: [FRONTEND_URL, FRONTEND_URL_ALT],
  });

  await app.register(helmet);
  await app.register(multipart);
  await app.register(rateLimit, {
    max: 3000,
    timeWindow: '1 minute',
    allowList: (request) =>
      request.url === '/api/health' || request.url.startsWith('/api/auth'),
  });

  // Light rate limit for AI-calling routes
  await app.register(async function stricterRateLimit(instance) {
    await instance.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request) => request.ip,
    });
  }, { prefix: '/api/assistant' });

  await app.register(async function stricterRateLimit2(instance) {
    await instance.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request) => request.ip,
    });
  }, { prefix: '/api/mcp' });

  await app.register(async function stricterRateLimit3(instance) {
    await instance.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request) => request.ip,
    });
  }, { prefix: '/api/autopilot' });

  void db;

  // Request logging — log every API request with method, path, status, and response time.
  // Only the pathname is logged; the query string is intentionally dropped because
  // provider callbacks (OAuth `code`, `access_token`, etc.) can carry secrets that
  // must never reach the logs.
  app.addHook('onResponse', (request, reply, done) => {
    const responseTime = reply.elapsedTime;
    const method = request.method;
    let pathname = '/';
    try {
      pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    } catch {
      pathname = '[unparseable]';
    }
    const status = reply.statusCode;
    console.log(`[Request] ${method} ${pathname} → ${status} (${responseTime.toFixed(0)}ms)`);
    done();
  });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/connectors/presets') ||
      pathname === '/api/health' ||
      pathname === '/api/system/status'
    ) {
      return;
    }
    await requireAuth(request, reply);
    // If requireAuth already rejected the request, stop here.
    if (reply.sent) return;

    // CSRF defense-in-depth for state-changing requests.
    //
    // VIMO authenticates with a custom `x-session-token` header rather than a
    // cookie, which already prevents classic CSRF (a browser will not attach a
    // custom header to a cross-site request). The double-submit `x-csrf-token`
    // (sent equal to the session token by the client) hardens this further and
    // is forward-compatible with future cookie-based sessions.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const sessionToken = request.headers['x-session-token'];
      const csrfToken = request.headers['x-csrf-token'];
      if (!csrfToken || csrfToken !== sessionToken) {
        return reply.status(403).send({ error: 'Invalid or missing CSRF token' });
      }
    }
  });

  await app.register(authRoutes);
  await app.register(connectorRoutes);
  await app.register(integrationsRoutes);
  await app.register(brandProfileRoutes);
  await app.register(settingsRoutes);
  await app.register(userProfileRoutes);
  await app.register(scheduledPostsRoutes);
  await app.register(campaignRoutes);
  await app.register(viralStudioRoutes);
  await app.register(analyticsRoutes);
  await app.register(engagementRoutes);
  await app.register(mediaRoutes);
  await app.register(canvaRoutes);
  await app.register(reelsScriptRoutes);
  await app.register(notificationRoutes);
  await app.register(growthActionsRoutes);
  await app.register(intelligenceRoutes);
  await app.register(brandMemoryRoutes);
  await app.register(roastRoutes);
  await app.register(assistantRoutes);
  await app.register(mcpRoutes);
  await app.register(directorRoutes);
  await app.register(approvalRoutes);
  await app.register(memoryRoutes);
  await app.register(oauthRoutes);
  await app.register(simpleOAuthRoutes);
  await app.register(canvaIntegrationRoutes);
  await app.register(usageRoutes);
  await app.register(higgsfieldRoutes);
  await app.register(opportunityRoutes);
  await app.register(knowledgeGraphRoutes);
  await app.register(packInsightsRoutes);
  await app.register(socialAccountsRoutes);

  await app.register(contentLibraryRoutes);
  await app.register(statusRoutes);
  await app.register(activityRoutes);
  await app.register(connectionsRoutes);
  await app.register(packConnectionsRoutes);
  await app.register(pluginRoutes);

  app.setErrorHandler((error, request, reply) => {
    const formatted = formatError(error);
    app.log.error(error);
    reply.status(error.statusCode || 500).send(formatted);
  });

  app.get('/api/health', async () => {
    let dbStatus = 'error';
    try {
      await db.select().from(appSettings).limit(1).get();
      dbStatus = 'ok';
    } catch (err) {
      app.log.error(err, 'Database health check failed');
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      dbStatus,
      encryptionKeySet:
        process.env.ENCRYPTION_KEY !== 'change-this-to-a-random-32-character-string' &&
        Boolean(process.env.ENCRYPTION_KEY) &&
        (process.env.ENCRYPTION_KEY?.length || 0) >= 32,
      port: process.env.PORT,
    };
  });

  await initScheduler();
  await initViralStudioProcessing();

  // Track cron run time in app_settings
  async function trackCronRun(key: string): Promise<void> {
    try {
      const { appSettings: as } = await import('./db/schema');
      const { eq } = await import('drizzle-orm');
      const existing = db.select().from(as).where(eq(as.key, key)).get();
      const now = new Date().toISOString();
      if (existing) {
        db.update(as).set({ value: now, updatedAt: now }).where(eq(as.key, key)).run();
      } else {
        db.insert(as).values({ key, value: now, updatedAt: now }).run();
      }
    } catch { /* skip tracking errors */ }
  }

  // Schedule periodic post performance refresh every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Running post performance refresh...');
    await refreshPostPerformance();
    await trackCronRun('cron_last_post_performance');
  });
  console.log('[Cron] Post performance refresh scheduled: every 6 hours');

  cron.schedule('*/15 * * * *', async () => {
    console.log('[Cron] Running engagement pipeline...');
    try {
      await runEngagementPipelineForAllConnectors();
    } catch (err) {
      console.error('[Cron] Engagement pipeline error:', err);
    }
    await trackCronRun('cron_last_engagement');
  });
  console.log('[Cron] Engagement pipeline scheduled: every 15 minutes');

  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Capturing account snapshots...');
    try {
      const { captureAllAccountSnapshots } = await import('./services/accountSnapshotService');
      await captureAllAccountSnapshots();
    } catch (err) {
      console.error('[Cron] Account snapshot error:', err);
    }
    await trackCronRun('cron_last_account_snapshot');
  });
  console.log('[Cron] Account snapshot capture scheduled: daily at 8am');

  // Schedule Marketing Director — daily run at 8am
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Running Marketing Director (daily)...');
    try {
      const { brandProfiles: bp } = await import('./db/schema');
      const brands = db.select().from(bp).all();
      for (const brand of brands) {
        await runMarketingDirector({
          brandProfileId: brand.id,
          trigger: 'scheduled_daily',
        });
      }
    } catch (err) {
      console.error('[Cron] Marketing Director (daily) error:', err);
    }
    await trackCronRun('cron_last_director_daily');
  });
  console.log('[Cron] Marketing Director (daily) scheduled: 8am');

  // Schedule Marketing Director — weekly deep run on Monday at 7am
  cron.schedule('0 7 * * 1', async () => {
    console.log('[Cron] Running Marketing Director (weekly deep run)...');
    try {
      const { brandProfiles: bp } = await import('./db/schema');
      const brands = db.select().from(bp).all();
      for (const brand of brands) {
        await runMarketingDirector({
          brandProfileId: brand.id,
          trigger: 'scheduled_weekly',
        });
      }
    } catch (err) {
      console.error('[Cron] Marketing Director (weekly) error:', err);
    }
    await trackCronRun('cron_last_director_weekly');
  });
  console.log('[Cron] Marketing Director (weekly) scheduled: Monday 7am');

  // Morning Briefing Cron — generates morning briefing and opportunities at 7:30 AM daily
  cron.schedule('30 7 * * *', async () => {
    console.log('[Cron] Running Morning Briefing generation...');
    try {
      const { brandProfiles: bp } = await import('./db/schema');
      const { generateMorningBriefing } = await import('./agents/marketingDirector');
      const brands = db.select().from(bp).all();
      for (const brand of brands) {
        await runMarketingDirector({
          brandProfileId: brand.id,
          trigger: 'scheduled_daily',
        });
        // Wait a bit for director to complete, then generate briefing
        setTimeout(async () => {
          try {
            await generateMorningBriefing(brand.id);
          } catch (err) {
            console.error(`[Cron] Morning briefing error for ${brand.id}:`, err);
          }
        }, 90000); // 90s to let director finish
      }
    } catch (err) {
      console.error('[Cron] Morning Briefing error:', err);
    }
    await trackCronRun('cron_last_morning_briefing');
  });
  console.log('[Cron] Morning Briefing scheduled: 7:30am daily');

  cron.schedule('0 9 * * 1', async () => {
    console.log('[Cron] Running Content DNA refresh for all brands...');
    try {
      const { updateContentDNA } = await import('./services/brandMemoryService');
      const { brandProfiles: bp } = await import('./db/schema');
      const brands = db.select().from(bp).all();
      for (const brand of brands) {
        await updateContentDNA(brand.id);
      }
    } catch (err) {
      console.error('[Cron] Content DNA refresh error:', err);
    }
    await trackCronRun('cron_last_content_dna');
  });
  console.log('[Cron] Content DNA refresh scheduled: Monday 9am');

  // Knowledge Graph weekly rebuild — every Sunday at 3am. This walks every
  // published post with metrics and rebuilds the entity and relationship
  // tables from scratch so the graph stays in sync with the brand's
  // evolving performance.
  cron.schedule('0 3 * * 0', async () => {
    console.log('[Cron] Running knowledge graph weekly rebuild...');
    try {
      const { rebuildAllBrandsKnowledgeGraph } = await import('./services/knowledgeGraphService');
      const { brandProfiles: bp } = await import('./db/schema');
      const brands = db.select().from(bp).all();
      for (const brand of brands) {
        try {
          const { rebuildKnowledgeGraph } = await import('./services/knowledgeGraphService');
          await rebuildKnowledgeGraph(brand.id);
        } catch (err) {
          console.error(`[Cron] Knowledge graph rebuild failed for brand ${brand.id}:`, err);
        }
      }
      console.log(`[Cron] Knowledge graph weekly rebuild complete (${brands.length} brand(s))`);
    } catch (err) {
      console.error('[Cron] Knowledge graph weekly rebuild error:', err);
    }
    await trackCronRun('cron_last_knowledge_graph_rebuild');
  });
  console.log('[Cron] Knowledge graph weekly rebuild scheduled: Sunday 3am');

  // Rescue posts that were missed during downtime
  await rescueMissedPosts();

  initConnectorHealthCron();
  await trackCronRun('cron_last_connector_health');

  // Daily pack discovery refresh — re-runs discovery for installed intelligence packs
  cron.schedule('0 6 * * *', async () => {
    console.log('[Cron] Running pack discovery refresh...');
    try {
      const { installedPacks: ip } = await import('./db/schema');
      const { discoverPack } = await import('./services/packDiscoveryService');
      const { eq } = await import('drizzle-orm');
      const intelligencePacks = db.select().from(ip).all();
      for (const pack of intelligencePacks) {
        if (pack.configJson) {
          const config = JSON.parse(pack.configJson);
          const credentials = config.credentials || {};
          const result = await discoverPack(pack.packId, credentials);
          if (result.success) {
            config.discoveryItems = result.items;
            config.discoveredAt = new Date().toISOString();
            db.update(ip).set({
              configJson: JSON.stringify(config),
              updatedAt: new Date().toISOString(),
            }).where(eq(ip.id, pack.id)).run();
          }
        }
      }
      console.log(`[Cron] Pack discovery refresh complete for ${intelligencePacks.length} pack(s)`);
    } catch (err) {
      console.error('[Cron] Pack discovery refresh error:', err);
    }
    await trackCronRun('cron_last_pack_discovery');
  });
  console.log('[Cron] Pack discovery refresh scheduled: daily at 6am');

  // Set the app instance for shutdown handlers
  setAppInstance(app);

  await app.listen({ port: finalPort, host: '0.0.0.0' });
  console.log(`VIMO backend running on port ${finalPort}`);
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  setTimeout(() => process.exit(1), 1000);
});

/* ------------------------------------------------------------------ */
/*  Graceful Shutdown                                                  */
/* ------------------------------------------------------------------ */

function setupShutdownHandlers(getApp: () => FastifyInstance | null): void {
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. VIMO shutting down...`);

    const startTime = Date.now();
    const timeout = 5000;

    try {
      // 1. Stop accepting new BullMQ jobs by pausing all queues
      try {
        // Try to pause known BullMQ queues directly
        const BullMQ = await import('bullmq');
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        for (const queueName of ['scheduler-queue', 'viral-processing']) {
          try {
            const queue = new BullMQ.Queue(queueName, {
              connection: { url: redisUrl },
            });
            await queue.pause();
            await queue.close();
          } catch {
            // Queue not available
          }
        }
      } catch {
        // BullMQ not available
      }

      // 2. Wait up to 5 seconds for in-progress work
      const elapsed = Date.now() - startTime;
      if (elapsed < timeout) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(2000, timeout - elapsed)));
      }

      // 3. Close database connection
      try {
        const { db: database } = await import('./db');
        if (database && typeof (database as any).close === 'function') {
          (database as any).close();
        }
      } catch {
        // DB close not critical
      }

      // 4. Close the Fastify server
      const app = getApp();
      if (app) {
        try {
          await app.close();
        } catch {
          // Server close may fail
        }
      }

      // 5. Close Socket.IO
      try {
        const { io: socketIo } = await import('./index');
        if (socketIo) {
          socketIo.close();
        }
      } catch {
        // Socket may not be available
      }
    } catch (err) {
      console.error('[Shutdown] Error during graceful shutdown:', err);
    }

    const totalTime = Date.now() - startTime;
    console.log(`VIMO shut down gracefully in ${totalTime}ms. Goodbye.`);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Initialize shutdown handlers with a getter that will be updated after app is created
let _getApp: () => FastifyInstance | null = () => null;
export function setAppInstance(app: FastifyInstance): void {
  _getApp = () => app;
}
setupShutdownHandlers(() => _getApp());

export { io };

