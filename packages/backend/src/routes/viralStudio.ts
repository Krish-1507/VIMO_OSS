import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline as streamPipeline } from 'stream/promises';
import { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { viralJobs } from '../db/schema';
import { processVideoUpload } from '../services/viralStudioService';
import { formatError } from '../lib/errorFormatter';

const UPLOADS_DIR = path.resolve(process.cwd(), './data/uploads');
const CLIPS_DIR = path.resolve(process.cwd(), './data/clips');
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
const ALLOWED_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getVideoContentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    default:
      return 'video/mp4';
  }
}

function getMultipartFieldValue(field: unknown): string {
  if (Array.isArray(field)) {
    return getMultipartFieldValue(field[0]);
  }

  if (field && typeof field === 'object' && 'value' in field) {
    return String((field as { value?: unknown }).value || '');
  }

  return '';
}

export default async function viralStudioRoutes(app: FastifyInstance) {
  app.post('/api/viral/upload', async (request, reply) => {
    try {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });

      const multipart = await request.file({
        limits: {
          fileSize: MAX_UPLOAD_SIZE,
        },
      });

      if (!multipart) {
        return reply.status(400).send({ error: 'Video upload is required.' });
      }

      const brandProfileId = getMultipartFieldValue(multipart.fields.brandProfileId);

      if (!brandProfileId) {
        return reply.status(400).send({ error: 'brandProfileId is required.' });
      }

      const extension = path.extname(multipart.filename || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return reply.status(400).send({ error: 'Only .mp4, .mov, and .webm uploads are supported.' });
      }

      if (!ALLOWED_MIME_TYPES.has(multipart.mimetype)) {
        return reply.status(400).send({ error: `Unsupported MIME type: ${multipart.mimetype}` });
      }

      const savedFilename = `${crypto.randomUUID()}${extension}`;
      const savedPath = path.join(UPLOADS_DIR, savedFilename);

      // Security check: ensure savedPath is inside UPLOADS_DIR
      if (!savedPath.startsWith(UPLOADS_DIR)) {
        return reply.status(400).send({ error: 'Invalid file path.' });
      }

      await streamPipeline(multipart.file, fs.createWriteStream(savedPath));

      const job = await processVideoUpload(savedPath, brandProfileId);
      return reply.status(202).send(job);
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/viral/jobs', async (request, reply) => {
    try {
      const jobs = await db.select().from(viralJobs).orderBy(desc(viralJobs.createdAt)).all();
      return jobs.map((job) => ({
        ...job,
        filename: path.basename(job.videoPath),
        transcript: job.transcript || '',
        moments: parseJson(job.momentsJson) || [],
        clips: parseJson(job.clipsJson) || [],
      }));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/viral/jobs/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const job = await db.select().from(viralJobs).where(eq(viralJobs.id, id)).get();
      if (!job) {
        return reply.status(404).send({ error: 'Viral job not found.' });
      }

      return {
        ...job,
        filename: path.basename(job.videoPath),
        transcript: job.transcript || '',
        moments: parseJson(job.momentsJson) || [],
        clips: parseJson(job.clipsJson) || [],
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  app.get('/api/viral/clips/:filename', async (request, reply) => {
    try {
      const { filename } = request.params as { filename: string };
      const safeFilename = sanitizeFilename(filename);
      const filePath = path.join(CLIPS_DIR, safeFilename);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'Clip not found.' });
      }

      reply.header('Content-Disposition', `attachment; filename="${safeFilename}"`);
      reply.type(getVideoContentType(safeFilename));
      return reply.send(fs.createReadStream(filePath));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
