import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline as streamPipeline } from 'stream/promises';
import { generateText } from 'ai';
import OpenAI from 'openai';
import { Queue, Worker, Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { connectors, viralJobs, appSettings } from '../db/schema';
import { callWithProviderChain } from '../lib/llmProvider';
import * as credentialStore from '../lib/credentialStore';
import { io } from '../index';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require('fluent-ffmpeg') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath = require('ffmpeg-static') as string | undefined;

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const UPLOADS_DIR = path.resolve(process.cwd(), './data/uploads');
const CLIPS_DIR = path.resolve(process.cwd(), './data/clips');
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<any>;

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ViralMoment {
  startTime: number;
  endTime: number;
  hookText: string;
  viralityScore: number;
  reason: string;
  clipType: 'insight' | 'funny' | 'surprising' | 'emotional' | 'educational' | 'controversial';
}

export interface ViralClip extends ViralMoment {
  clipNumber: number;
  filename: string;
  clipUrl: string;
  outputPath: string;
  brandProfileId: string;
}

interface ViralProcessingJobData {
  jobId: string;
  videoFilePath: string;
  brandProfileId: string;
}

type ViralJobStatus =
  | 'queued'
  | 'transcribing'
  | 'detecting_moments'
  | 'extracting_clips'
  | 'completed'
  | 'failed';

let queue: Queue<ViralProcessingJobData> | null = null;
let worker: Worker<ViralProcessingJobData> | null = null;
let isFallbackMode = false;
let sentimentPipelinePromise: Promise<any> | null = null;

function ensureDataDirs() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function tryConnectRedis(): Promise<boolean> {
  return new Promise((resolve) => {
    const IORedis = require('ioredis');
    const client = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    const timeout = setTimeout(() => {
      client.disconnect();
      resolve(false);
    }, 2000);

    client.on('connect', () => {
      clearTimeout(timeout);
      client.disconnect();
      resolve(true);
    });

    client.on('error', () => {
      clearTimeout(timeout);
      client.disconnect();
      resolve(false);
    });

    client.connect().catch(() => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function getOpenAIClient(): Promise<OpenAI> {
  const connector = await db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.type, 'llm'),
        eq(connectors.provider, 'openai'),
        eq(connectors.status, 'active')
      )
    )
    .get();

  if (!connector) {
    throw new Error('Viral Studio transcription requires an OpenAI connector with a valid API key.');
  }

  const apiKey = await credentialStore.getCredential(connector.id, 'apiKey');
  if (!apiKey) {
    throw new Error('Viral Studio transcription requires an OpenAI connector with a valid API key.');
  }

  return new OpenAI({ apiKey });
}

async function getSentimentPipeline() {
  if (!sentimentPipelinePromise) {
    sentimentPipelinePromise = dynamicImport('@xenova/transformers').then((mod) =>
      mod.pipeline(
        'sentiment-analysis',
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
      )
    );
  }

  return sentimentPipelinePromise;
}

function scoreTextEnergy(text: string): number {
  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const emphasisWords = (
    text.match(/\b(amazing|crazy|wild|insane|secret|never|always|must|huge|shocking|best|worst)\b/gi) ||
    []
  ).length;
  const uppercaseWords = (text.match(/\b[A-Z]{3,}\b/g) || []).length;
  const shortSentenceBoost = text.length > 0 && text.length < 120 ? 8 : 0;

  return clamp(
    15 + exclamations * 6 + questions * 4 + emphasisWords * 7 + uppercaseWords * 3 + shortSentenceBoost,
    0,
    35
  );
}

async function scoreMomentLocally(text: string): Promise<number> {
  try {
    const sentimentPipeline = await getSentimentPipeline();
    const sentimentResult = (await sentimentPipeline(text, {
      top_k: 1,
    })) as Array<{ label: string; score: number }>;
    const topResult = Array.isArray(sentimentResult) ? sentimentResult[0] : sentimentResult;
    const sentimentBoost =
      topResult?.label === 'POSITIVE'
        ? topResult.score * 8
        : topResult?.label === 'NEGATIVE'
        ? topResult.score * 10
        : 0;

    return clamp(scoreTextEnergy(text) + sentimentBoost, 0, 20);
  } catch {
    return clamp(scoreTextEnergy(text), 0, 20);
  }
}

async function logViralStatus(params: {
  jobId: string;
  status: ViralJobStatus;
  transcript?: string | null;
  moments?: ViralMoment[] | null;
  clips?: ViralClip[] | null;
}) {
  await db
    .update(viralJobs)
    .set({
      status: params.status,
      transcript: params.transcript ?? undefined,
      momentsJson: params.moments ? JSON.stringify(params.moments) : undefined,
      clipsJson: params.clips ? JSON.stringify(params.clips) : undefined,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(viralJobs.id, params.jobId))
    .run();
}

function emitProgress(jobId: string, status: ViralJobStatus, progress: number, message: string) {
  io.emit('viral:progress', {
    jobId,
    status,
    progress,
    message,
    timestamp: new Date().toISOString(),
  });
}

export async function transcribeVideo(
  videoPath: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const openai = await getOpenAIClient();
  const response = (await openai.audio.transcriptions.create({
    file: fs.createReadStream(videoPath) as any,
    model: 'whisper-1',
    response_format: 'verbose_json',
  })) as any;

  const segments = Array.isArray(response.segments)
    ? response.segments.map((segment: any) => ({
        start: Number(segment.start) || 0,
        end: Number(segment.end) || 0,
        text: String(segment.text || '').trim(),
      }))
    : [];

  return {
    text: String(response.text || '').trim(),
    segments,
  };
}

export async function detectViralMoments(
  segments: Array<{ start: number; end: number; text: string }>,
  fullTranscript: string
): Promise<
  Array<{
    startTime: number;
    endTime: number;
    hookText: string;
    viralityScore: number;
    reason: string;
    clipType: 'insight' | 'funny' | 'surprising' | 'emotional' | 'educational' | 'controversial';
  }>
> {
  // Use model router for task routing and callWithProviderChain for execution
  const text = await callWithProviderChain(
    'viral moment detection',
    async (activeProvider, activeModelId) => {
      const prompt = `You are a viral content expert. Analyze this video transcript and identify the best moments for short-form viral clips (TikTok, Reels, Shorts). Each clip should be 15-90 seconds.
Full transcript: ${fullTranscript}
Timestamps: ${JSON.stringify(segments)}
Identify up to 8 viral moments. For each, return JSON array: [ { startTime: seconds, endTime: seconds, hookText: string (what makes this moment a hook), viralityScore: number 0-100, reason: string (why this will perform well), clipType: 'insight'|'funny'|'surprising'|'emotional'|'educational'|'controversial' } ]
Score 80+ for truly exceptional moments. Most should be 40-70.`;
      const { text: t } = await generateText({
        model: activeProvider.chat(activeModelId),
        prompt,
      });
      return t;
    },
    () => {
      // Fallback: return default moments
      return JSON.stringify([
        { startTime: 0, endTime: 30, hookText: 'Key insight from video', viralityScore: 60, reason: 'Default viral moment', clipType: 'educational' },
      ]);
    },
  );

  const rawMoments = JSON.parse(stripCodeFences(text || '[]')) as ViralMoment[];
  const normalizedMoments = await Promise.all(
    rawMoments.slice(0, 8).map(async (moment) => {
      const segmentText = segments
        .filter((segment) => segment.start < moment.endTime && segment.end > moment.startTime)
        .map((segment) => segment.text)
        .join(' ');
      const localBoost = await scoreMomentLocally(segmentText || moment.hookText);
      return {
        ...moment,
        startTime: Number(moment.startTime) || 0,
        endTime: Number(moment.endTime) || 0,
        hookText: String(moment.hookText || '').trim(),
        reason: String(moment.reason || '').trim(),
        viralityScore: clamp(Math.round((Number(moment.viralityScore) || 0) + localBoost), 0, 100),
      };
    })
  );

  return normalizedMoments
    .filter((moment) => moment.endTime > moment.startTime)
    .sort((a, b) => b.viralityScore - a.viralityScore);
}

export async function extractClip(
  videoPath: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<string> {
  ensureDataDirs();

  const duration = Math.max(endTime - startTime, 1);
  const fadeOutStart = Math.max(duration - 0.3, 0);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .videoFilters([
        'scale=1080:-1',
        'crop=1080:1920:(in_w-1080)/2:0',
        'fade=t=in:st=0:d=0.3',
        `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.3`,
      ])
      .outputOptions(['-preset veryfast', '-movflags +faststart'])
      .on('end', () => resolve())
      .on('error', (error: Error) => reject(error))
      .save(outputPath);
  });

  return outputPath;
}

async function isAgentsPaused(): Promise<boolean> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, 'agentsPaused')).get();
  return row?.value === 'true';
}

async function runViralProcessingJob(jobData: ViralProcessingJobData): Promise<void> {
  if (await isAgentsPaused()) {
    console.log('[ViralStudio] Paused. Skipping video processing.');
    return;
  }
  const { jobId, videoFilePath, brandProfileId } = jobData;

  try {
    await logViralStatus({ jobId, status: 'transcribing' });
    emitProgress(jobId, 'transcribing', 10, 'Transcribing video');

    const transcriptResult = await transcribeVideo(videoFilePath);

    await logViralStatus({
      jobId,
      status: 'detecting_moments',
      transcript: transcriptResult.text,
    });
    emitProgress(jobId, 'detecting_moments', 35, 'Detecting viral moments');

    const moments = await detectViralMoments(transcriptResult.segments, transcriptResult.text);

    await logViralStatus({
      jobId,
      status: 'extracting_clips',
      transcript: transcriptResult.text,
      moments,
    });
    emitProgress(jobId, 'extracting_clips', 55, 'Extracting top clips');

    const topMoments = moments.slice(0, 5);
    const clips: ViralClip[] = [];

    for (let index = 0; index < topMoments.length; index += 1) {
      const moment = topMoments[index];
      const filename = `${jobId}-clip-${index + 1}.mp4`;
      const outputPath = path.join(CLIPS_DIR, filename);
      await extractClip(videoFilePath, moment.startTime, moment.endTime, outputPath);

      clips.push({
        ...moment,
        clipNumber: index + 1,
        filename,
        clipUrl: `/api/viral/clips/${filename}`,
        outputPath,
        brandProfileId,
      });

      const progress = Math.round(55 + ((index + 1) / Math.max(topMoments.length, 1)) * 40);
      emitProgress(
        jobId,
        'extracting_clips',
        progress,
        `Extracting clip ${index + 1} of ${topMoments.length}`
      );
    }

    await logViralStatus({
      jobId,
      status: 'completed',
      transcript: transcriptResult.text,
      moments,
      clips,
    });

    io.emit('viral:complete', {
      jobId,
      status: 'completed',
      videoPath: videoFilePath,
      filename: path.basename(videoFilePath),
      transcript: transcriptResult.text,
      moments,
      clips,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logViralStatus({ jobId, status: 'failed' });
    io.emit('viral:progress', {
      jobId,
      status: 'failed',
      progress: 100,
      message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

export async function processVideoUpload(
  videoFilePath: string,
  brandProfileId: string
): Promise<{ jobId: string }> {
  ensureDataDirs();

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(viralJobs).values({
    id: jobId,
    videoPath: videoFilePath,
    status: 'queued',
    transcript: null,
    momentsJson: null,
    clipsJson: null,
    createdAt: now,
    updatedAt: now,
  });

  if (!isFallbackMode && queue) {
    await queue.add(
      'process-video',
      {
        jobId,
        videoFilePath,
        brandProfileId,
      },
      {
        jobId,
        removeOnComplete: 50,
        removeOnFail: 50,
      }
    );
  } else {
    setImmediate(() => {
      void runViralProcessingJob({
        jobId,
        videoFilePath,
        brandProfileId,
      }).catch((error) => {
        // eslint-disable-next-line no-console
        console.error(`[ViralStudio] Fallback job ${jobId} failed`, error);
      });
    });
  }

  return { jobId };
}

export async function initViralStudioProcessing(): Promise<void> {
  ensureDataDirs();

  const redisAvailable = await tryConnectRedis();
  if (!redisAvailable) {
    isFallbackMode = true;
    // eslint-disable-next-line no-console
    console.log('[ViralStudio] Redis unavailable. Using in-process fallback processing.');
    return;
  }

  isFallbackMode = false;
  queue = new Queue<ViralProcessingJobData>('viral-processing', {
    connection: {
      url: REDIS_URL,
    },
  });

  worker = new Worker<ViralProcessingJobData>(
    'viral-processing',
    async (job: Job<ViralProcessingJobData>) => {
      await runViralProcessingJob(job.data);
    },
    {
      connection: {
        url: REDIS_URL,
      },
    }
  );

  worker.on('failed', (job, error) => {
    // eslint-disable-next-line no-console
    console.error(`[ViralStudio] Job ${job?.id} failed`, error);
  });
}

