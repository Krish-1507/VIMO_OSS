/**
 * Autopilot Routes
 *
 * POST   /api/autopilot/start       — start a new autopilot session (returns immediately)
 * GET    /api/autopilot/status/:id  — get full status of an autopilot session
 * GET    /api/autopilot/active      — get the currently active autopilot for the brand
 * POST   /api/autopilot/:id/pause   — pause an autopilot session
 * POST   /api/autopilot/:id/resume  — resume a paused autopilot session
 */

import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { autopilotSessions } from '../db/schema';
import { formatError } from '../lib/errorFormatter';
import { startAutopilot, pauseAutopilot, resumeAutopilot } from '../agents/autopilotAgent';

export default async function autopilotRoutes(app: FastifyInstance) {
  // POST /api/autopilot/start — start a new autopilot session
  app.post('/api/autopilot/start', async (request, reply) => {
    try {
      const body = request.body as {
        brandProfileId: string;
        audienceDescription: string;
        primaryGoal: string;
        goalType: string;
        durationDays: number;
        channels: string[];
      };

      // Validate required fields
      const missing: string[] = [];
      if (!body.brandProfileId) missing.push('brandProfileId');
      if (!body.audienceDescription) missing.push('audienceDescription');
      if (!body.primaryGoal) missing.push('primaryGoal');
      if (!body.goalType) missing.push('goalType');
      if (!body.durationDays || body.durationDays < 1) missing.push('durationDays');
      if (!body.channels || body.channels.length === 0) missing.push('channels');

      if (missing.length > 0) {
        return reply.status(400).send({
          error: `Missing required fields: ${missing.join(', ')}`,
        });
      }

      // Check that no other autopilot session is currently "monitoring" for this brand
      const activeSession = db
        .select()
        .from(autopilotSessions)
        .where(eq(autopilotSessions.brandProfileId, body.brandProfileId))
        .all()
        .find((s: any) => s.status === 'monitoring' || s.status === 'initializing' || s.status === 'researching' || s.status === 'strategizing' || s.status === 'creating_content' || s.status === 'scheduling' || s.status === 'activating_engagement');

      if (activeSession) {
        return reply.status(409).send({
          error: 'An autopilot session is already active for this brand. Only one active autopilot per brand is allowed.',
          activeSessionId: (activeSession as any).id,
        });
      }

      // Start autopilot in background — returns immediately
      const result = await startAutopilot({
        brandProfileId: body.brandProfileId,
        audienceDescription: body.audienceDescription,
        primaryGoal: body.primaryGoal,
        goalType: body.goalType,
        durationDays: body.durationDays,
        channels: body.channels,
      });

      return {
        autopilotId: result.autopilotId,
        message: 'Autopilot is starting. You will see real-time updates in the VIMO dashboard.',
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/autopilot/status/:id — return full session with parsed log/calendar/posts
  app.get('/api/autopilot/status/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const session = await db
        .select()
        .from(autopilotSessions)
        .where(eq(autopilotSessions.id, id))
        .get();

      if (!session) {
        return reply.status(404).send({ error: 'Autopilot session not found' });
      }

      // Parse JSON fields
      return {
        ...session,
        channels: session.channelsJson ? JSON.parse(session.channelsJson) : [],
        log: session.logJson ? JSON.parse(session.logJson) : [],
        timeline: session.timelineJson ? JSON.parse(session.timelineJson) : [],
        contentCalendar: session.contentCalendarJson ? JSON.parse(session.contentCalendarJson) : null,
        scheduledPostIds: session.scheduledPostIdsJson ? JSON.parse(session.scheduledPostIdsJson) : [],
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/autopilot/:id/timeline — structured, explainable activity feed
  app.get('/api/autopilot/:id/timeline', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const session = await db
        .select()
        .from(autopilotSessions)
        .where(eq(autopilotSessions.id, id))
        .get();

      if (!session) {
        return reply.status(404).send({ error: 'Autopilot session not found' });
      }

      let timeline: unknown[] = [];
      try {
        timeline = session.timelineJson ? JSON.parse(session.timelineJson) : [];
      } catch { /* ignore */ }

      return {
        autopilotId: id,
        status: session.status,
        currentPhase: (session as any).currentPhase || '',
        progressPercent: session.progressPercent,
        timeline,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/autopilot/active — returns the currently active autopilot for the brand
  app.get('/api/autopilot/active', async (request, reply) => {
    try {
      const { brandProfileId } = request.query as { brandProfileId?: string };

      if (!brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required' });
      }

      const activeStatuses = ['initializing', 'researching', 'strategizing', 'creating_content', 'scheduling', 'activating_engagement', 'monitoring'];

      const session = db
        .select()
        .from(autopilotSessions)
        .where(eq(autopilotSessions.brandProfileId, brandProfileId))
        .all()
        .find((s: any) => activeStatuses.includes(s.status)) || null;

      if (!session) {
        return reply.status(404).send({ error: 'No active autopilot session found' });
      }

      return {
        ...session,
        channels: session.channelsJson ? JSON.parse(session.channelsJson) : [],
        log: session.logJson ? JSON.parse(session.logJson) : [],
        timeline: session.timelineJson ? JSON.parse(session.timelineJson) : [],
        contentCalendar: session.contentCalendarJson ? JSON.parse(session.contentCalendarJson) : null,
        scheduledPostIds: session.scheduledPostIdsJson ? JSON.parse(session.scheduledPostIdsJson) : [],
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/autopilot/:id/pause — pause an autopilot session
  app.post('/api/autopilot/:id/pause', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const session = await db
        .select()
        .from(autopilotSessions)
        .where(eq(autopilotSessions.id, id))
        .get();

      if (!session) {
        return reply.status(404).send({ error: 'Autopilot session not found' });
      }

      await pauseAutopilot(id);

      return { success: true, message: 'Autopilot paused.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/autopilot/:id/resume — resume a paused autopilot session
  app.post('/api/autopilot/:id/resume', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const session = await db
        .select()
        .from(autopilotSessions)
        .where(eq(autopilotSessions.id, id))
        .get();

      if (!session) {
        return reply.status(404).send({ error: 'Autopilot session not found' });
      }

      if (session.status !== 'paused') {
        return reply.status(400).send({ error: 'Autopilot session is not paused' });
      }

      await resumeAutopilot(id);

      return { success: true, message: 'Autopilot resuming.' };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
