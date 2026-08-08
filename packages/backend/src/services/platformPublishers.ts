/**
 * Platform Publishers — YouTube / TikTok / Pinterest
 *
 * Real publish handlers for the platforms that used to be "connect only".
 * Each publisher is a pure function (axios is the only boundary) so the
 * request payloads can be tested end-to-end with a mocked HTTP client.
 *
 * All errors are mapped to plain-English messages — no OAuth, token, or API
 * details ever leak to the UI.
 */
import axios from 'axios';

export interface PublisherOpts {
  accessToken: string;
  content: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
}

export interface PublishOutcome {
  success: boolean;
  platformPostId?: string;
  error?: string;
}

function firstLine(content: string, maxLen: number): string {
  const line = (content.split('\n').find((l) => l.trim().length > 0) || content).trim();
  return line.slice(0, maxLen) || 'VIMO post';
}

function mapError(err: unknown, platformLabel: string): string {
  const anyErr = err as { response?: { status?: number; data?: { message?: string; error?: string } }; message?: string };
  const status = anyErr?.response?.status;
  const apiMessage = anyErr?.response?.data?.message || anyErr?.response?.data?.error || '';
  const lower = `${status || ''} ${apiMessage}`.toLowerCase();

  if (status === 401 || status === 403 || lower.includes('token') || lower.includes('unauthorized')) {
    return `We need you to reconnect your ${platformLabel} account. Go to Social Accounts and reconnect.`;
  }
  if (status === 429 || lower.includes('rate')) {
    return `${platformLabel} is receiving too many requests right now. Please wait a moment and try again.`;
  }
  if (lower.includes('permission') || lower.includes('scope')) {
    return `VIMO needs updated permissions for ${platformLabel}. Reconnect it in Social Accounts.`;
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econn') || lower.includes('failed to fetch')) {
    return `Unable to reach ${platformLabel}. Please check your internet connection and try again.`;
  }
  return `We had trouble publishing to ${platformLabel}. ${apiMessage ? apiMessage : 'Please try again.'}`;
}

/* ─── YouTube ─────────────────────────────────────────────────────────────── */

/**
 * Uploads a video to YouTube via the Data API v3 resumable upload:
 *   1. POST an upload session (snippet + status) → get the resumable URL
 *   2. PUT the video bytes to that URL
 */
export async function publishToYouTube(opts: PublisherOpts): Promise<PublishOutcome> {
  const videoUrl = opts.mediaUrls?.[0];
  if (!videoUrl) {
    return { success: false, error: 'YouTube posts need a video. Attach a video file to publish.' };
  }

  try {
    const title = String(opts.metadata?.title || firstLine(opts.content, 100));
    const initRes = await axios.post(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        snippet: { title, description: opts.content.slice(0, 5000) },
        status: { privacyStatus: String(opts.metadata?.privacyStatus || 'public') },
      },
      { headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' } },
    );

    const uploadUrl = initRes.headers?.location || initRes.headers?.Location;
    if (!uploadUrl) {
      return { success: false, error: 'YouTube did not give us an upload link. Please try again.' };
    }

    const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    const contentType = String(videoRes.headers?.['content-type'] || 'video/mp4');

    const uploadRes = await axios.put(uploadUrl, videoRes.data, {
      headers: { 'Content-Type': contentType },
    });

    const videoId = String(uploadRes.data?.id || '');
    return videoId
      ? { success: true, platformPostId: videoId }
      : { success: false, error: 'YouTube finished the upload but did not return a video ID. Please try again.' };
  } catch (err) {
    return { success: false, error: mapError(err, 'YouTube') };
  }
}

/* ─── TikTok ──────────────────────────────────────────────────────────────── */

/**
 * Publishes a video to TikTok via the Content Posting API v2:
 *   1. POST /post/publish/video/init/ with a PULL_FROM_URL source
 *   2. Poll /post/publish/status/fetch/ until the post completes
 *
 * TikTok restricts API posts to "only me" privacy unless the app is
 * whitelisted for public posting, so SELF_ONLY is the honest default.
 */
export async function publishToTikTok(opts: PublisherOpts): Promise<PublishOutcome> {
  const videoUrl = opts.mediaUrls?.[0];
  if (!videoUrl) {
    return { success: false, error: 'TikTok posts need a video. Attach a video file to publish.' };
  }

  try {
    const title = String(opts.metadata?.title || firstLine(opts.content, 150));
    const initRes = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        post_info: {
          title,
          privacy_level: 'SELF_ONLY',
          ...(opts.metadata?.privacyLevel
            ? { privacy_level: String(opts.metadata.privacyLevel) }
            : {}),
        },
        source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
      },
      { headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' } },
    );

    const publishId = initRes.data?.data?.publish_id;
    if (!publishId) {
      return { success: false, error: 'TikTok did not accept the video. Make sure the video link is publicly accessible.' };
    }

    // Poll until TikTok reports the post finished.
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
        { get_post_info: { publish_id: publishId } },
        { headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' } },
      );
      const status = statusRes.data?.data?.status;
      if (status === 'PUBLISH_COMPLETE') {
        return { success: true, platformPostId: String(publishId) };
      }
      if (status === 'FAILED' || status === 'FAILED_TO_FETCH') {
        return { success: false, error: 'TikTok could not finish the post. Please try again.' };
      }
    }

    return { success: false, error: 'TikTok is taking a long time to process the video. You can check your TikTok drafts.' };
  } catch (err) {
    return { success: false, error: mapError(err, 'TikTok') };
  }
}

/* ─── Pinterest ───────────────────────────────────────────────────────────── */

/**
 * Creates a pin on Pinterest (v5 API):
 *   1. Resolve the board — metadata.boardId wins, else metadata.boardName,
 *      else the user's first board.
 *   2. POST the pin with an image_url media source.
 */
export async function publishToPinterest(opts: PublisherOpts): Promise<PublishOutcome> {
  const imageUrl = opts.mediaUrls?.[0];
  if (!imageUrl) {
    return { success: false, error: 'Pinterest posts need an image. Attach an image to publish.' };
  }

  try {
    let boardId = opts.metadata?.boardId ? String(opts.metadata.boardId) : '';

    if (!boardId) {
      const boardsRes = await axios.get('https://api.pinterest.com/v5/boards', {
        headers: { Authorization: `Bearer ${opts.accessToken}` },
      });
      const boards: Array<{ id: string; name: string }> = boardsRes.data?.items || [];
      const targetName = opts.metadata?.boardName ? String(opts.metadata.boardName).toLowerCase() : '';
      const chosen =
        boards.find((b) => b.name.toLowerCase().includes(targetName) && targetName) ||
        boards[0];
      if (!chosen?.id) {
        return { success: false, error: 'No Pinterest board found. Create a board on Pinterest first, then try again.' };
      }
      boardId = chosen.id;
    }

    const title = String(opts.metadata?.title || firstLine(opts.content, 100));
    const res = await axios.post(
      'https://api.pinterest.com/v5/pins',
      {
        title,
        description: opts.content.slice(0, 500),
        board_id: boardId,
        media_source: { source_type: 'image_url', url: imageUrl },
      },
      { headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' } },
    );

    const pinId = String(res.data?.id || '');
    return pinId
      ? { success: true, platformPostId: pinId }
      : { success: false, error: 'Pinterest finished but did not return a pin ID. Please try again.' };
  } catch (err) {
    return { success: false, error: mapError(err, 'Pinterest') };
  }
}
