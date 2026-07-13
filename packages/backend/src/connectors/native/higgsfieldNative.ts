/**
 * Higgsfield AI — Native Connector
 *
 * REST API client for Higgsfield cinematic AI video generation.
 * Base URL: https://api.higgsfield.ai
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface HiggsfieldGenerationParams {
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  duration?: number; // 3 to 10 seconds, default 6
  style?: string;
  referenceImageUrl?: string;
  motion?: string;
  seed?: number;
}

interface HiggsfieldCreateResponse {
  jobId: string;
  estimatedSeconds?: number;
}

export interface HiggsfieldJobStatusResult {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progressPercent?: number;
  outputUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
}

export interface HiggsfieldStyle {
  id: string;
  name: string;
  previewUrl?: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface GenerateVideoResult {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  estimatedSeconds: number;
}

export interface PollCompleteResult {
  videoUrl: string;
  thumbnailUrl: string;
}

/* ------------------------------------------------------------------ */
/*  HTTP helper                                                       */
/* ------------------------------------------------------------------ */

async function requestJson<T>(params: {
  url: string;
  apiKey: string;
  method: 'GET' | 'POST';
  body?: unknown;
}): Promise<T> {
  const { url, apiKey, method, body } = params;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid API key. Check your Higgsfield API key in Connector Hub.');
    }
    if (res.status === 429) {
      throw new Error('Higgsfield rate limit reached. Try again in a few minutes.');
    }
    if (res.status === 422) {
      const bodyText = await res.text();
      let detail = 'Validation error.';
      try {
        const parsed = JSON.parse(bodyText);
        detail = parsed.message || parsed.detail || parsed.error || bodyText;
      } catch {
        detail = bodyText;
      }
      throw new Error(detail);
    }
    throw new Error(`Higgsfield API error (${res.status}).`);
  }

  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ */
/*  Core API functions                                                */
/* ------------------------------------------------------------------ */

/**
 * Generate a video using Higgsfield AI.
 * Returns the job ID immediately — the generation runs asynchronously.
 */
export async function generateVideo(
  params: HiggsfieldGenerationParams,
  apiKey: string,
): Promise<GenerateVideoResult> {
  const payload: Record<string, unknown> = {
    prompt: params.prompt,
    aspectRatio: params.aspectRatio ?? '9:16',
    duration: params.duration ?? 6,
    style: params.style ?? 'cinematic',
  };

  if (params.referenceImageUrl) payload.referenceImageUrl = params.referenceImageUrl;
  if (params.motion) payload.motion = params.motion;
  if (params.seed !== undefined) payload.seed = params.seed;

  const res = await requestJson<HiggsfieldCreateResponse>({
    url: 'https://api.higgsfield.ai/v1/generation',
    apiKey,
    method: 'POST',
    body: payload,
  });

  return {
    jobId: res.jobId,
    status: 'queued',
    estimatedSeconds: res.estimatedSeconds ?? params.duration ?? 6,
  };
}

/**
 * Check the status of a video generation job.
 */
export async function checkGenerationStatus(
  jobId: string,
  apiKey: string,
): Promise<{ status: string; videoUrl?: string; thumbnailUrl?: string; error?: string }> {
  const res = await requestJson<HiggsfieldJobStatusResult>({
    url: `https://api.higgsfield.ai/v1/generation/${jobId}`,
    apiKey,
    method: 'GET',
  });

  return {
    status: res.status,
    videoUrl: res.outputUrl,
    thumbnailUrl: res.thumbnailUrl,
    error: res.errorMessage,
  };
}

/**
 * Poll the generation status until complete.
 * Checks every 5 seconds. Times out after 10 minutes.
 * Calls onProgress callback with each status update.
 */
export async function pollUntilComplete(
  jobId: string,
  apiKey: string,
  onProgress?: (status: string) => void,
): Promise<PollCompleteResult> {
  const timeoutMs = 10 * 60 * 1000; // 10 minutes
  const intervalMs = 5000;
  const start = Date.now();

  while (true) {
    const status = await checkGenerationStatus(jobId, apiKey);

    onProgress?.(status.status);

    if (status.status === 'completed') {
      if (!status.videoUrl) {
        throw new Error('Higgsfield job completed but no video URL returned.');
      }
      return {
        videoUrl: status.videoUrl,
        thumbnailUrl: status.thumbnailUrl ?? '',
      };
    }

    if (status.status === 'failed') {
      throw new Error(status.error ?? 'Higgsfield generation failed.');
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('Higgsfield generation timed out after 10 minutes.');
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * List available video generation styles.
 * Results are cached in memory for 1 hour.
 */
const styleCache = new Map<string, { expiresAt: number; styles: HiggsfieldStyle[] }>();

export async function listStyles(apiKey: string): Promise<HiggsfieldStyle[]> {
  const cached = styleCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.styles;
  }

  const res = await requestJson<{ styles: HiggsfieldStyle[] }>({
    url: 'https://api.higgsfield.ai/v1/styles',
    apiKey,
    method: 'GET',
  });

  const styles = res.styles ?? [];

  styleCache.set(apiKey, {
    expiresAt: Date.now() + 60 * 60 * 1000,
    styles,
  });

  return styles;
}

/* ------------------------------------------------------------------ */
/*  Legacy aliases — backward compatibility                           */
/* ------------------------------------------------------------------ */

export { listStyles as listHiggsfieldStyles };

export async function createHiggsfieldJob(params: {
  apiKey: string;
  payload: Record<string, unknown>;
}): Promise<HiggsfieldCreateResponse> {
  return generateVideo(
    params.payload as unknown as HiggsfieldGenerationParams,
    params.apiKey,
  );
}

export async function getHiggsfieldJobStatus(params: {
  apiKey: string;
  jobId: string;
}): Promise<HiggsfieldJobStatusResult> {
  return requestJson<HiggsfieldJobStatusResult>({
    url: `https://api.higgsfield.ai/v1/generation/${params.jobId}`,
    apiKey: params.apiKey,
    method: 'GET',
  });
}
