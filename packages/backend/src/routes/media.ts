import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline as streamPipeline } from 'stream/promises';
import { FastifyInstance } from 'fastify';
import { formatError } from '../lib/errorFormatter';
import { generatePublicUrl } from '../services/mediaService';
import { db } from '../db';
import { media, appSettings } from '../db/schema';
import { eq } from 'drizzle-orm';

const MEDIA_DIR = path.resolve(process.cwd(), './data/media');
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/quicktime', 'video/webm',
]);

export default async function mediaRoutes(app: FastifyInstance) {
  // POST /api/media/upload — enhanced with media table tracking
  app.post('/api/media/upload', async (request, reply) => {
    try {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });

      const multipart = await request.file({
        limits: { fileSize: MAX_UPLOAD_SIZE },
      });

      if (!multipart) {
        return reply.status(400).send({ error: 'File upload is required.' });
      }

      const extension = path.extname(multipart.filename || '').toLowerCase();
      const allowedExts = new Set([...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS]);

      if (!allowedExts.has(extension)) {
        return reply.status(400).send({
          error: `Unsupported file type: ${extension}. Allowed: ${[...allowedExts].join(', ')}`,
        });
      }

      if (!ALLOWED_MIME_TYPES.has(multipart.mimetype)) {
        return reply.status(400).send({ error: `Unsupported MIME type: ${multipart.mimetype}` });
      }

      const savedFilename = `${crypto.randomUUID()}${extension}`;
      const savedPath = path.join(MEDIA_DIR, savedFilename);

      if (!savedPath.startsWith(MEDIA_DIR)) {
        return reply.status(400).send({ error: 'Invalid file path.' });
      }

      await streamPipeline(multipart.file, fs.createWriteStream(savedPath));

      // Store record in media table
      const mediaId = path.basename(savedFilename, extension);
      try {
        await db.insert(media).values({
          id: mediaId,
          originalFilename: multipart.filename || 'unknown',
          storedFilename: savedFilename,
          mimeType: multipart.mimetype,
          sizeBytes: fs.statSync(savedPath).size,
          publicUrl: null,
          createdAt: new Date().toISOString(),
        });
      } catch {
        // Media table may not exist yet, fall back to file-only tracking
      }

      return reply.status(201).send({
        success: true,
        mediaId,
        filename: savedFilename,
        url: `/api/media/file/${savedFilename}`,
        previewUrl: `/api/media/file/${savedFilename}`,
        mimeType: multipart.mimetype,
        size: fs.statSync(savedPath).size,
      });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/media/:id — serve media by ID, resolving from DB
  app.get('/api/media/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      let storedFilename = '';

      // Try DB lookup first
      try {
        const row = await db.select().from(media).where(eq(media.id, id)).get();
        if (row) {
          storedFilename = row.storedFilename;
          reply.type(row.mimeType);
        }
      } catch {
        // Media table may not exist
      }

      if (!storedFilename) {
        // Try to find by filename pattern: {id}.*
        const files = fs.readdirSync(MEDIA_DIR);
        const match = files.find((f) => f.startsWith(id + '.'));
        if (!match) {
          return reply.status(404).send({ error: 'Media not found.' });
        }
        storedFilename = match;
        const ext = path.extname(match).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
          '.webp': 'image/webp', '.mp4': 'video/mp4',
        };
        reply.type(mimeMap[ext] || 'application/octet-stream');
      }

      const filePath = path.join(MEDIA_DIR, storedFilename);
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'File not found on disk.' });
      }

      reply.header('Cache-Control', 'public, max-age=31536000');
      return reply.send(fs.createReadStream(filePath));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // GET /api/media/file/:filename — serve media by raw filename
  app.get('/api/media/file/:filename', async (request, reply) => {
    try {
      const { filename } = request.params as { filename: string };
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(MEDIA_DIR, safeFilename);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'File not found.' });
      }

      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
      };

      const ext = path.extname(safeFilename).toLowerCase();
      reply.type(mimeMap[ext] || 'application/octet-stream');
      reply.header('Cache-Control', 'public, max-age=31536000');
      return reply.send(fs.createReadStream(filePath));
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/media/set-public-url — set the base URL for public media serving
  app.post('/api/media/set-public-url', async (request, reply) => {
    try {
      const { baseUrl } = request.body as { baseUrl: string };
      if (!baseUrl || typeof baseUrl !== 'string') {
        return reply.status(400).send({ error: 'baseUrl is required.' });
      }
      await db.insert(appSettings).values({
        key: 'MEDIA_PUBLIC_BASE_URL',
        value: baseUrl,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: baseUrl, updatedAt: new Date().toISOString() },
      });
      return reply.status(200).send({ success: true, baseUrl });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  // POST /api/media/generate-public-url — generate a public URL for a media item
  app.post('/api/media/generate-public-url', async (request, reply) => {
    try {
      const { mediaId } = request.body as { mediaId: string };
      if (!mediaId) {
        return reply.status(400).send({ error: 'mediaId is required.' });
      }
      const publicUrl = await generatePublicUrl(mediaId);
      return reply.status(200).send({ publicUrl });
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
