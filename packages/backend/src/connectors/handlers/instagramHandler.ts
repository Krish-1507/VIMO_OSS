import axios from 'axios';
import { io } from '../../index';

type InstagramAccountType = 'business' | 'creator' | 'personal';

type VerifyAccountTypeResponse = {
  accountType: InstagramAccountType | string;
  instagramAccountId: string;
  username: string;
  followersCount: number;
  mediaCount: number;
};

export async function verifyAccountType(accessToken: string): Promise<VerifyAccountTypeResponse> {
  // Step 1: get linked Facebook pages
  const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
    params: { access_token: accessToken },
  });

  const pages = pagesRes.data?.data ?? [];
  for (const page of pages) {
    const pageId = page?.id;
    if (!pageId) continue;

    // Step 2: fetch linked Instagram Business Account from this page
    const igRes = await axios.get(`https://graph.facebook.com/v19.0/${pageId}`, {
      params: {
        fields: 'instagram_business_account',
        access_token: accessToken,
      },
    });

    const igAccount = igRes.data?.instagram_business_account;
    const igAccountId = igAccount?.id;

    if (!igAccountId) continue;

    // Step 3: fetch IG account details
    const accountRes = await axios.get(`https://graph.facebook.com/v19.0/${igAccountId}`, {
      params: {
        fields: 'username,followers_count,media_count,account_type',
        access_token: accessToken,
      },
    });

    return {
      accountType: accountRes.data?.account_type ?? 'business',
      instagramAccountId: igAccountId,
      username: accountRes.data?.username ?? '',
      followersCount: Number(accountRes.data?.followers_count ?? 0),
      mediaCount: Number(accountRes.data?.media_count ?? 0),
    };
  }

  return {
    accountType: 'personal',
    instagramAccountId: '',
    username: '',
    followersCount: 0,
    mediaCount: 0,
  };
}

export async function createMediaContainer(params: {
  instagramAccountId: string;
  accessToken: string;
  imageUrl?: string;
  videoUrl?: string;
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'REELS' | 'STORIES';
  coverUrl?: string;
}): Promise<string> {
  const { instagramAccountId, accessToken, caption, mediaType, imageUrl, videoUrl } = params;

  const url = `https://graph.facebook.com/v19.0/${instagramAccountId}/media`;
  const body: Record<string, any> = {
    caption,
    access_token: accessToken,
  };

  if (mediaType === 'IMAGE') {
    if (!imageUrl) {
      throw new Error('Instagram image posts require an image. Upload an image in Content Studio.');
    }
    body.image_url = imageUrl;
  } else if (mediaType === 'REELS') {
    if (!videoUrl) {
      throw new Error('Instagram reel posts require a video.');
    }
    body.media_type = 'REELS';
    body.video_url = videoUrl;
    body.share_to_feed = true;
  } else if (mediaType === 'STORIES') {
    if (!imageUrl && !videoUrl) {
      throw new Error('Instagram story posts require an image_url or video_url.');
    }
    body.media_type = 'STORIES';
    if (imageUrl) body.image_url = imageUrl;
    if (videoUrl) body.video_url = videoUrl;
  } else if (mediaType === 'VIDEO') {
    // Not standard for IG Graph basic /media; included for completeness
    if (!videoUrl) {
      throw new Error('Instagram video posts require a video_url.');
    }
    body.video_url = videoUrl;
  } else {
    throw new Error(`Unsupported mediaType: ${mediaType}`);
  }

  const res = await axios.post(url, body);
  const creationId = res.data?.id || res.data?.creation_id;
  if (!creationId) {
    throw new Error('Failed to create Instagram media container.');
  }
  return String(creationId);
}

export async function publishMediaContainer(params: {
  instagramAccountId: string;
  accessToken: string;
  containerId: string;
}): Promise<{ postId: string; permalink: string }> {
  const { instagramAccountId, accessToken, containerId } = params;

  const pollUrl = `https://graph.facebook.com/v19.0/${containerId}`;
  const publishUrl = `https://graph.facebook.com/v19.0/${instagramAccountId}/media_publish`;
  const publishBody = {
    creation_id: containerId,
    access_token: accessToken,
  };

  // Poll container status
  const start = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  const intervalMs = 5 * 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const statusRes = await axios.get(pollUrl, {
      params: { fields: 'status_code', access_token: accessToken },
    });

    const statusCode = statusRes.data?.status_code;
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERROR') {
      throw new Error('Instagram media container returned ERROR status.');
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for Instagram media container to finish publishing.');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const publishRes = await axios.post(publishUrl, publishBody);
  const postId = String(publishRes.data?.id || publishRes.data?.post_id || '');
  if (!postId) throw new Error('Instagram publish did not return a post id.');

  // Fetch permalink
  const permalinkRes = await axios.get(`https://graph.facebook.com/v19.0/${postId}`, {
    params: { fields: 'permalink', access_token: accessToken },
  });

  const permalink = permalinkRes.data?.permalink;
  if (!permalink) throw new Error('Instagram permalink not found after publishing.');

  return { postId, permalink: String(permalink) };
}

/* ------------------------------------------------------------------ */
/*  Real Engagement API functions                                      */
/* ------------------------------------------------------------------ */

export interface InstagramComment {
  commentId: string;
  text: string;
  username: string;
  timestamp: string;
  postId: string;
  isReply: boolean;
  parentCommentId?: string;
}

export async function fetchRecentComments(params: {
  instagramAccountId: string;
  accessToken: string;
  sinceTimestamp?: number;
}): Promise<InstagramComment[]> {
  const { instagramAccountId, accessToken, sinceTimestamp } = params;
  const allComments: InstagramComment[] = [];

  // Step 1: Get 10 most recent posts
  let mediaUrl = `https://graph.facebook.com/v19.0/${instagramAccountId}/media`;
  let mediaParams: Record<string, string | number> = {
    fields: 'id,timestamp',
    limit: 10,
    access_token: accessToken,
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const mediaRes = await axios.get(mediaUrl, { params: mediaParams });
    const mediaData = mediaRes.data?.data ?? [];

    // Step 2: For each post, fetch comments
    for (const media of mediaData) {
      const postId = media.id;
      if (!postId) continue;

      let commentsUrl = `https://graph.facebook.com/v19.0/${postId}/comments`;
      let commentsParams: Record<string, string | number> = {
        fields: 'id,text,username,timestamp,replies{id,text,username,timestamp}',
        access_token: accessToken,
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const commentsRes = await axios.get(commentsUrl, { params: commentsParams });
        const commentsData = commentsRes.data?.data ?? [];

        for (const comment of commentsData) {
          if (!comment.id || !comment.username) continue;
          const commentTs = new Date(comment.timestamp).getTime();
          if (sinceTimestamp && commentTs <= sinceTimestamp) continue;

          allComments.push({
            commentId: comment.id,
            text: comment.text || '',
            username: comment.username,
            timestamp: comment.timestamp,
            postId,
            isReply: false,
          });

          // Process inline replies
          const replies = comment.replies?.data ?? [];
          for (const reply of replies) {
            if (!reply.id || !reply.username) continue;
            const replyTs = new Date(reply.timestamp).getTime();
            if (sinceTimestamp && replyTs <= sinceTimestamp) continue;

            allComments.push({
              commentId: reply.id,
              text: reply.text || '',
              username: reply.username,
              timestamp: reply.timestamp,
              postId,
              isReply: true,
              parentCommentId: comment.id,
            });
          }
        }

        // Handle pagination for comments
        const afterCursor = commentsRes.data?.paging?.cursors?.after;
        if (afterCursor) {
          commentsParams.after = afterCursor;
        } else {
          break;
        }
      }
    }

    // Handle pagination for media
    const mediaAfter = mediaRes.data?.paging?.cursors?.after;
    if (mediaAfter) {
      mediaParams.after = mediaAfter;
    } else {
      break;
    }
  }

  return allComments;
}

export async function replyToComment(params: {
  commentId: string;
  replyText: string;
  accessToken: string;
}): Promise<{ replyId: string }> {
  const { commentId, replyText, accessToken } = params;
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${commentId}/replies`,
    {
      message: replyText,
      access_token: accessToken,
    }
  );
  const replyId = String(res.data?.id || '');
  if (!replyId) throw new Error('Failed to post reply to Instagram comment.');
  return { replyId };
}

export async function deleteComment(params: {
  commentId: string;
  accessToken: string;
}): Promise<void> {
  const { commentId, accessToken } = params;
  await axios.delete(`https://graph.facebook.com/v19.0/${commentId}`, {
    params: { access_token: accessToken },
  });
}

export async function hideComment(params: {
  commentId: string;
  accessToken: string;
  hide: boolean;
}): Promise<void> {
  const { commentId, accessToken, hide } = params;
  await axios.post(
    `https://graph.facebook.com/v19.0/${commentId}`,
    null,
    {
      params: {
        is_hidden: hide.toString(),
        access_token: accessToken,
      },
    }
  );
}

function extractInstagramErrorCode(err: any): number | null {
  const code = err?.response?.data?.error?.code;
  if (typeof code === 'number') return code;
  const parsed = Number(code);
  if (Number.isFinite(parsed)) return parsed;
  return null;
}

function mapInstagramErrorMessage(err: any): { message: string; code?: number } {
  const code = extractInstagramErrorCode(err);
  if (code === 190) {
    return {
      code,
      message:
        'Your Instagram access token has expired. Go to Connector Hub and reconnect your Instagram account.',
    };
  }
  if (code === 100) {
    return {
      code,
      message: 'The image URL is not publicly accessible. Instagram requires images to be hosted at a public URL.',
    };
  }
  if (code === 9) {
    return {
      code,
      message: 'Instagram rate limit reached. This post will be retried in 1 hour automatically.',
    };
  }

  const msg =
    err?.response?.data?.error?.message ||
    err?.message ||
    'Instagram API error while publishing.';
  return { code: code ?? undefined, message: msg };
}

// Minimal ScheduledPost type (imports avoided due to circular module boundaries)
export type ScheduledPostForHandler = {
  id: string;
  brandProfileId: string;
  content: string;
  platform: string;
  scheduledAt: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
};

export async function publishPost(
  post: ScheduledPostForHandler,
  connectorCredentials: Record<string, string>
): Promise<{
  success: boolean;
  platformPostId?: string;
  permalink?: string;
  error?: string;
}> {
  const accessToken = connectorCredentials.accessToken;
  const instagramAccountId = connectorCredentials.instagramAccountId || connectorCredentials.igAccountId;

  if (!accessToken) {
    return { success: false, error: 'Missing Instagram access token in connector credentials.' };
  }

  if (!instagramAccountId) {
    return { success: false, error: 'Missing Instagram account id (instagramAccountId) in connector credentials.' };
  }

  // Step 1: verify account type from token (required by spec)
  try {
    const verified = await verifyAccountType(accessToken);
    const accountType = verified.accountType;

    if (accountType === 'personal') {
      return {
        success: false,
        error: 'Personal accounts cannot post via API. Switch to a Business or Creator account.',
      };
    }
  } catch (err) {
    // If verify fails, proceed with best-effort but surface error
    const mapped = mapInstagramErrorMessage(err);
    return { success: false, error: mapped.message };
  }

  // Step 2/3: create & publish based on content type (current app uses mediaUrls; assume IMAGE for now)
  try {
    const mediaUrls = post.mediaUrls ?? [];
    const imageUrl = mediaUrls[0];

    if (!imageUrl) {
      return {
        success: false,
        error:
          'Instagram image posts require an image. Upload an image in Content Studio.',
      };
    }

    const caption = post.content || '';
    // mediaType mapping: use IMAGE unless metadata says otherwise
    const mediaType =
      (post.metadata?.mediaType as any) === 'REELS'
        ? 'REELS'
        : (post.metadata?.mediaType as any) === 'STORIES'
          ? 'STORIES'
          : 'IMAGE';

    const containerId = await createMediaContainer({
      instagramAccountId,
      accessToken,
      imageUrl: mediaType === 'IMAGE' || mediaType === 'STORIES' ? imageUrl : undefined,
      videoUrl: mediaType === 'REELS' || mediaType === 'STORIES' ? (mediaUrls[0] ?? undefined) : undefined,
      caption,
      mediaType,
    });

    const published = await publishMediaContainer({
      instagramAccountId,
      accessToken,
      containerId,
    });

    // Step 6: emit socket event
    const contentPreview = (post.content || '').substring(0, 120);
    io.emit('post:published', {
      postId: post.id,
      platform: 'instagram',
      permalink: published.permalink,
      contentPreview,
    });

    return {
      success: true,
      platformPostId: published.postId,
      permalink: published.permalink,
    };
  } catch (err) {
    const mapped = mapInstagramErrorMessage(err);

    return {
      success: false,
      error: mapped.message,
    };
  }
}
