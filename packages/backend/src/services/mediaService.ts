import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { media, appSettings } from '../db/schema';

const MEDIA_DIR = path.resolve(process.cwd(), './data/media');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4',
]);

const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export interface MediaRecord {
  mediaId: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
}

export async function storeUploadedMedia(
  filePath: string,
  originalFilename: string
): Promise<MediaRecord> {
  // Validate mime type by extension
  const ext = path.extname(originalFilename).toLowerCase();
  const extToMime: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
  };

  const mimeType = extToMime[ext];
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: .jpg, .jpeg, .png, .webp, .mp4`);
  }

  // Validate file size
  const stat = fs.statSync(filePath);
  const isImage = mimeType.startsWith('image/');
  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (stat.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    throw new Error(`File too large (${Math.round(stat.size / (1024 * 1024))}MB). Max: ${maxMB}MB for ${isImage ? 'images' : 'videos'}.`);
  }

  // Generate UUID filename and copy
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const mediaId = crypto.randomUUID();
  const storedFilename = `${mediaId}${ext}`;
  const destPath = path.join(MEDIA_DIR, storedFilename);

  fs.copyFileSync(filePath, destPath);

  // Store record in DB
  await db.insert(media).values({
    id: mediaId,
    originalFilename,
    storedFilename,
    mimeType,
    sizeBytes: stat.size,
    publicUrl: null,
    createdAt: new Date().toISOString(),
  });

  return {
    mediaId,
    localPath: destPath,
    mimeType,
    sizeBytes: stat.size,
  };
}

export async function getPublicUrl(mediaId: string): Promise<string | null> {
  const row = await db.select().from(media).where(eq(media.id, mediaId)).get();
  if (!row || !row.publicUrl) return null;

  // Verify the URL is still accessible with a HEAD request
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(row.publicUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) return row.publicUrl;
  } catch {
    // URL not accessible
  }

  return null;
}

export async function generatePublicUrl(mediaId: string): Promise<string> {
  const row = await db.select().from(media).where(eq(media.id, mediaId)).get();
  if (!row) throw new Error(`Media ${mediaId} not found`);

  // Strategy 1: Check if MEDIA_PUBLIC_BASE_URL is configured
  const setting = await db.select().from(appSettings)
    .where(eq(appSettings.key, 'MEDIA_PUBLIC_BASE_URL')).get();
  if (setting?.value) {
    const publicUrl = `${setting.value.replace(/\/$/, '')}/api/media/${mediaId}`;
    // Update the record
    await db.update(media).set({ publicUrl }).where(eq(media.id, mediaId)).run();
    return publicUrl;
  }

  // Strategy 2: Serve from localhost (dev only)
  const port = process.env.PORT || '3001';
  const publicUrl = `http://localhost:${port}/api/media/${mediaId}`;
  await db.update(media).set({ publicUrl }).where(eq(media.id, mediaId)).run();
  return publicUrl;
}
