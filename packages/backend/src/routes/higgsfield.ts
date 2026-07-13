import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { formatError } from '../lib/errorFormatter';
import * as credentialStore from '../lib/credentialStore';
import { listStylesWithCache } from '../services/higgsfieldService';
import { createHiggsfieldJob, getHiggsfieldJobStatus } from '../connectors/native/higgsfieldNative';
import { higgsfieldJobs } from '../db/schema';
import { io } from '../index';

const JOB_DIR = path.resolve(process.cwd(), './data/higgsfield');

function ensureDir() {
  fs.mkdirSync(JOB_DIR, { recursive: true });
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download generated video (${res.status}).`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

export default async function higgsfieldRoutes(app: FastifyInstance) {
  app.post('/api/higgsfield/generate', async (request, reply) => {
    try {
      const body = request.body as {
        prompt: string;
        aspectRatio?: '9:16' | '16:9' | '1:1';
        duration?: number;
        style?: string;
        referenceImageUrl?: string;
        connectorId?: string;
        brandProfileId?: string;
      };

      if (!body?.prompt) return reply.status(400).send({ error: 'prompt is required' });

      ensureDir();

      const connectorId = body.connectorId;
      const brandProfileId = body.brandProfileId;

      if (!connectorId) {
        return reply.status(400).send({ error: 'connectorId is required for now to select the Higgsfield credentials' });
      }
      if (!brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required for now to associate the job with a brand profile' });
      }

      const apiKey = await credentialStore.getCredential(connectorId, 'apiKey');
      if (!apiKey) {
        return reply.status(400).send({ error: 'Higgsfield apiKey is not configured for this connector.' });
      }

      const localRowId = crypto.randomUUID();
      const now = new Date().toISOString();

      await db
        .insert(higgsfieldJobs)
        .values({
          id: localRowId,
          connectorId,
          brandProfileId,
          jobId: crypto.randomUUID(), // placeholder until we receive remote job id
          prompt: body.prompt,
          aspectRatio: body.aspectRatio ?? '9:16',
          duration: body.duration ?? 6,
          style: body.style ?? 'cinematic',
          referenceImageUrl: body.referenceImageUrl ?? undefined,
          status: 'queued',
          videoUrl: undefined,
          thumbnailUrl: undefined,
          localFilePath: undefined,
          errorMessage: undefined,
          createdAt: now,
          completedAt: undefined,
        });

      io.emit('higgsfield:job_started', { jobId: localRowId });

      setImmediate(async () => {
        try {
          await processHiggsfieldJob({ jobId: localRowId, apiKey });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db
            .update(higgsfieldJobs)
            .set({
              status: 'failed',
              errorMessage: message,
              completedAt: new Date().toISOString(),
            })
            .where(eq(higgsfieldJobs.id, localRowId))
            .run();

          io.emit('higgsfield:complete', { jobId: localRowId, error: message });
        }
      });

      return { jobId: localRowId, estimatedSeconds: body.duration ?? 6 };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/higgsfield/jobs', async (request, reply) => {
    try {
      const q = request.query as { brandProfileId?: string };
      if (!q.brandProfileId) return reply.status(400).send({ error: 'brandProfileId is required' });

      const jobs = await db
        .select()
        .from(higgsfieldJobs)
        .where(eq(higgsfieldJobs.brandProfileId, q.brandProfileId))
        .orderBy(desc(higgsfieldJobs.createdAt))
        .limit(20);

      return jobs;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/higgsfield/jobs/:jobId/status', async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const job = await db.select().from(higgsfieldJobs).where(eq(higgsfieldJobs.id, jobId)).get();
      if (!job) return reply.status(404).send({ error: 'Job not found' });
      return job;
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/higgsfield/styles', async (request, reply) => {
    try {
      const q = request.query as { connectorId?: string };
      if (!q.connectorId) return reply.status(400).send({ error: 'connectorId is required' });

      const apiKey = await credentialStore.getCredential(q.connectorId, 'apiKey');
      if (!apiKey) return reply.status(400).send({ error: 'Higgsfield apiKey is not configured.' });

      return await listStylesWithCache(apiKey);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/higgsfield/video/:jobId', async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const job = await db.select().from(higgsfieldJobs).where(eq(higgsfieldJobs.id, jobId)).get();

      if (!job) return reply.status(404).send({ error: 'Job not found' });
      if (!job.localFilePath) return reply.status(404).send({ error: 'Video not ready' });

      if (!fs.existsSync(job.localFilePath)) return reply.status(404).send({ error: 'Video file not found on disk' });

      reply.header('Content-Type', 'video/mp4');
      return reply.send(fs.createReadStream(job.localFilePath));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}

async function processHiggsfieldJob(params: { jobId: string; apiKey: string }) {
  const { jobId: localRowId, apiKey } = params;

  await db
    .update(higgsfieldJobs)
    .set({ status: 'processing' })
    .where(eq(higgsfieldJobs.id, localRowId))
    .run();

  const job = await db.select().from(higgsfieldJobs).where(eq(higgsfieldJobs.id, localRowId)).get();
  if (!job) throw new Error('Job not found for processing');

  const createRes = await createHiggsfieldJob({
    apiKey,
    payload: {
      prompt: job.prompt,
      aspectRatio: job.aspectRatio,
      durationSeconds: job.duration,
      styleId: job.style,
      referenceImageUrl: job.referenceImageUrl ?? undefined,
    },
  });

  const remoteJobId = createRes.jobId;

  await db
    .update(higgsfieldJobs)
    .set({ jobId: remoteJobId })
    .where(eq(higgsfieldJobs.id, localRowId))
    .run();

  const start = Date.now();
  const timeoutMs = 10 * 60 * 1000;
  const intervalMs = 5000;

  while (true) {
    const status = await getHiggsfieldJobStatus({ apiKey, jobId: remoteJobId });

    io.emit('higgsfield:progress', {
      jobId: localRowId,
      status: status.status,
      progressPercent: (status as any).progressPercent ?? undefined,
    });

    if (status.status === 'completed') {
      const localVideoPath = path.join(JOB_DIR, `${localRowId}.mp4`);

      if ((status as any).videoUrl) {
        await downloadToFile((status as any).videoUrl, localVideoPath);
      } else if ((status as any).outputUrl) {
        await downloadToFile((status as any).outputUrl, localVideoPath);
      } else if ((status as any).videoUrl) {
        await downloadToFile((status as any).videoUrl, localVideoPath);
      }

      await db
        .update(higgsfieldJobs)
        .set({
          status: 'completed',
          completedAt: new Date().toISOString(),
          videoUrl: (status as any).videoUrl ?? (status as any).outputUrl ?? undefined,
          thumbnailUrl: status.thumbnailUrl ?? undefined,
          localFilePath: localVideoPath,
          errorMessage: undefined,
        })
        .where(eq(higgsfieldJobs.id, localRowId))
        .run();

      io.emit('higgsfield:complete', {
        jobId: localRowId,
        localVideoPath,
        thumbnailUrl: status.thumbnailUrl ?? undefined,
      });

      return;
    }

    if (status.status === 'failed') {
      const message = status.errorMessage ?? 'Higgsfield job failed';

      await db
        .update(higgsfieldJobs)
        .set({
          status: 'failed',
          errorMessage: message,
          completedAt: new Date().toISOString(),
        })
        .where(eq(higgsfieldJobs.id, localRowId))
        .run();

      io.emit('higgsfield:complete', { jobId: localRowId, error: message });
      return;
    }

    if (Date.now() - start > timeoutMs) {
      const message = 'Timed out waiting for Higgsfield generation.';
      await db
        .update(higgsfieldJobs)
        .set({
          status: 'failed',
          errorMessage: message,
          completedAt: new Date().toISOString(),
        })
        .where(eq(higgsfieldJobs.id, localRowId))
        .run();

      io.emit('higgsfield:complete', { jobId: localRowId, error: message });
      return;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

