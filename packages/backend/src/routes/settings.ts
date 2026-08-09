import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { appSettings, agentLogs, connectors } from '../db/schema';
import { eq, desc, lt } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';
import { ConnectorRegistry } from '../lib/connectorRegistry';

export default async function settingsRoutes(app: FastifyInstance) {
  // Get all settings
  app.get('/api/settings', async (request, reply) => {
    try {
      const rows = await db.select().from(appSettings).all();
      const settings: Record<string, string> = {};
      rows.forEach((row) => {
        settings[row.key] = row.value;
      });
      return settings;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Update a setting
  app.post('/api/settings', async (request, reply) => {
    try {
      const { key, value } = request.body as { key: string; value: string };
      const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
      
      if (existing) {
        await db.update(appSettings).set({ value, updatedAt: new Date().toISOString() }).where(eq(appSettings.key, key)).run();
      } else {
        await db.insert(appSettings).values({
          key,
          value,
          updatedAt: new Date().toISOString(),
        }).run();
      }
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Email notification config (SMTP + recipient + enable toggle)
  app.get('/api/settings/email', async (_request, reply) => {
    try {
      const { getEmailConfig } = await import('../services/emailService');
      const config = getEmailConfig();
      return {
        enabled: config.enabled,
        recipient: config.recipient,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUser: config.smtpUser,
        smtpPass: config.smtpPass ? '********' : '',
        smtpFrom: config.smtpFrom,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/settings/email', async (request, reply) => {
    try {
      const body = request.body as {
        enabled?: boolean;
        recipient?: string;
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPass?: string;
        smtpFrom?: string;
      };
      const { getEmailConfig, setEmailConfig } = await import('../services/emailService');
      const current = getEmailConfig();
      // Never overwrite the stored password with the masked placeholder.
      if (body.smtpPass === '********') body.smtpPass = current.smtpPass;
      setEmailConfig({
        enabled: body.enabled,
        recipient: body.recipient,
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpUser: body.smtpUser,
        smtpPass: body.smtpPass,
        smtpFrom: body.smtpFrom,
      });
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Send a test email using the current SMTP config
  app.post('/api/settings/email/test', async (_request, reply) => {
    try {
      const { getEmailConfig, sendEmail } = await import('../services/emailService');
      const config = getEmailConfig();
      if (!config.recipient) {
        return reply.status(400).send({ error: 'Set a recipient email address first.' });
      }
      const result = await sendEmail(
        config.recipient,
        'VIMO test email',
        'This is a test email from VIMO. If you are reading this, your SMTP settings work.'
      );
      if (!result.ok) {
        return reply.status(400).send({ error: result.message });
      }
      return { success: true, message: result.message };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Team mode settings — workspace toggle + member roster
  app.get('/api/settings/team', async (_request, reply) => {
    try {
      const rows = await db.select().from(appSettings).where(
        eq(appSettings.key, 'team_members')
      ).get();
      const enabledRow = await db.select().from(appSettings).where(
        eq(appSettings.key, 'team_mode_enabled')
      ).get();
      let members: Array<{ name: string; email: string; role: string }> = [];
      if (rows?.value) {
        try {
          members = JSON.parse(rows.value);
        } catch {
          members = [];
        }
      }
      return {
        enabled: enabledRow?.value === '1',
        members: Array.isArray(members) ? members : [],
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.post('/api/settings/team', async (request, reply) => {
    try {
      const body = request.body as {
        enabled?: boolean;
        members?: Array<{ name: string; email: string; role: string }>;
      };
      const now = new Date().toISOString();
      const upsert = (key: string, value: string) => {
        const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
        if (existing) {
          db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run();
        } else {
          db.insert(appSettings).values({ key, value, updatedAt: now }).run();
        }
      };
      if (body.enabled !== undefined) upsert('team_mode_enabled', body.enabled ? '1' : '0');
      if (body.members !== undefined) {
        const validRoles = ['owner', 'admin', 'editor', 'viewer'];
        const sanitized = body.members
          .filter((m) => m && m.email)
          .map((m) => ({
            name: String(m.name || '').slice(0, 80),
            email: String(m.email || '').slice(0, 160),
            role: validRoles.includes(m.role) ? m.role : 'viewer',
          }));
        upsert('team_members', JSON.stringify(sanitized));
      }
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Export all data
  app.get('/api/settings/export', async (request, reply) => {
    try {
      // This is a simplified export. In a real app, we'd export all tables.
      const tables = ['brand_profiles', 'campaigns', 'scheduled_posts', 'connectors', 'agent_logs', 'app_settings', 'viral_jobs', 'engagement_queue'];
      
      const [profiles, campaignRows, posts, connectorRows, logs, settings, jobs, queue] = await Promise.all([
        db.select().from(require('../db/schema').brandProfiles).all(),
        db.select().from(require('../db/schema').campaigns).all(),
        db.select().from(require('../db/schema').scheduledPosts).all(),
        db.select().from(require('../db/schema').connectors).all(),
        db.select().from(require('../db/schema').agentLogs).all(),
        db.select().from(require('../db/schema').appSettings).all(),
        db.select().from(require('../db/schema').viralJobs).all(),
        db.select().from(require('../db/schema').engagementQueue).all(),
      ]);

      // Omit credentials from connectors
      const safeConnectors = connectorRows.map((c: any) => {
        const { encryptedCredentials, ...rest } = c;
        return rest;
      });

      return {
        brandProfiles: profiles,
        campaigns: campaignRows,
        scheduledPosts: posts,
        connectors: safeConnectors,
        agentLogs: logs,
        appSettings: settings,
        viralJobs: jobs,
        engagementQueue: queue,
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Clear analytics data older than 30 days
  app.post('/api/settings/clear-analytics', async (request, reply) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString();

      await db.delete(agentLogs).where(lt(agentLogs.createdAt, dateStr)).run();
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Audit log viewer (last 100)
  app.get('/api/settings/audit-logs', async (request, reply) => {
    try {
      return await db.select().from(agentLogs).orderBy(desc(agentLogs.createdAt)).limit(100).all();
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Get onboarding progress
  app.get('/api/settings/onboarding', async (request, reply) => {
    try {
      const row = await db.select().from(appSettings).where(eq(appSettings.key, 'onboarding_progress')).get();
      if (!row) {
        return { isComplete: false, currentStep: 0, completedSteps: [] };
      }
      return JSON.parse(row.value);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Complete an onboarding step
  app.post('/api/settings/onboarding/complete-step', async (request, reply) => {
    try {
      const { step } = request.body as { step: string };
      const row = await db.select().from(appSettings).where(eq(appSettings.key, 'onboarding_progress')).get();
      const progress = row ? JSON.parse(row.value) : { isComplete: false, currentStep: 0, completedSteps: [] };

      if (!progress.completedSteps.includes(step)) {
        progress.completedSteps.push(step);
      }
      const stepIndex = ['welcome', 'llm', 'brand', 'social', 'complete'].indexOf(step);
      if (stepIndex >= 0) {
        progress.currentStep = Math.min(stepIndex + 1, 5);
      }
      if (step === 'complete' || progress.completedSteps.length >= 5) {
        progress.isComplete = true;
      }

      await db.insert(appSettings).values({
        key: 'onboarding_progress',
        value: JSON.stringify(progress),
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: JSON.stringify(progress), updatedAt: new Date().toISOString() },
      });

      return progress;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Reset onboarding (for PIN recovery flow)
  app.post('/api/settings/onboarding/reset', async (request, reply) => {
    try {
      await db.delete(appSettings).where(eq(appSettings.key, 'onboarding_progress')).run();
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Get model assignments
  app.get('/api/settings/model-assignments', async (request, reply) => {
    try {
      const row = await db.select().from(appSettings).where(eq(appSettings.key, 'modelAssignments')).get();
      const assignments = row ? JSON.parse(row.value) : {};

      // Resolve connector names
      const allConnectors = await db.select().from(connectors).all();
      const enriched: Record<string, any> = {};
      for (const [taskType, connectorId] of Object.entries(assignments)) {
        const conn = allConnectors.find((c) => c.id === connectorId);
        enriched[taskType] = {
          connectorId,
          connectorName: conn?.name || 'Unknown',
          provider: conn?.provider || 'unknown',
        };
      }

      return { assignments: enriched };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Update model assignments
  app.post('/api/settings/model-assignments', async (request, reply) => {
    try {
      const body = request.body as { assignments: Record<string, string> };
      const existing = await db.select().from(appSettings).where(eq(appSettings.key, 'modelAssignments')).get();
      if (existing) {
        await db.update(appSettings).set({ value: JSON.stringify(body.assignments), updatedAt: new Date().toISOString() }).where(eq(appSettings.key, 'modelAssignments')).run();
      } else {
        await db.insert(appSettings).values({ key: 'modelAssignments', value: JSON.stringify(body.assignments), updatedAt: new Date().toISOString() }).run();
      }
      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // Reset all data
  app.post('/api/settings/reset', async (request, reply) => {
    try {
      const { confirm } = request.body as { confirm: string };
      if (confirm !== 'RESET') {
        return reply.status(400).send(formatError(new Error('Invalid confirmation')));
      }

      // Delete everything in order to avoid FK issues (if any, though SQLite is lenient)
      const schema = require('../db/schema');
      await db.delete(schema.agentLogs).run();
      await db.delete(schema.scheduledPosts).run();
      await db.delete(schema.campaigns).run();
      await db.delete(schema.connectors).run();
      await db.delete(schema.brandProfiles).run();
      await db.delete(schema.viralJobs).run();
      await db.delete(schema.engagementQueue).run();
      await db.delete(schema.appSettings).run();

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
