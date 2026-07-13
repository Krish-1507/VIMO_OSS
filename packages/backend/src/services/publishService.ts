/**
 * Publish Service
 *
 * Routes all content publishing through the VIMO Social integration layer.
 * VIMO never directly interacts with platform APIs.
 *
 * Architecture:
 *   VIMO → Publishing Service → VIMO Social Integration Layer → Platform
 *
 * This service is provider-agnostic. Future providers can be swapped
 * without changing business logic.
 */
import { vimoSocialPublish } from './vimoSocialPublishService';

interface PublishParams {
  postId: string;
  content: string;
  platform: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
}

interface PublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
}

/**
 * Publishes content to a connected social media platform.
 * All publishing routes through VIMO Social — VIMO never directly
 * interacts with platform APIs.
 */
export async function publishToPlatform(params: PublishParams): Promise<PublishResult> {
  const { postId, content, platform, mediaUrls, metadata } = params;

  console.log(`[Publish] Publishing post ${postId} to ${platform} via VIMO Social...`);

  try {
    // Route through VimoSocial integration layer
    const result = await vimoSocialPublish.publish({
      postId,
      content,
      platforms: [platform],
      mediaUrls,
      metadata,
    });

    const platformResult = result.platformResults[platform];

    if (platformResult && platformResult.success) {
      return {
        success: true,
        platformPostId: platformResult.platformPostId,
      };
    }

    // User-friendly error messages — no technical jargon
    const errorMessage = platformResult?.error
      ? getFriendlyErrorMessage(platform, platformResult.error)
      : `We had trouble publishing to ${getPlatformLabel(platform)}. Please try again.`;

    return {
      success: false,
      error: errorMessage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Publish] Failed to publish to ${platform}:`, message);
    return {
      success: false,
      error: `Something went wrong while publishing to ${getPlatformLabel(platform)}. Please try again.`,
    };
  }
}

/**
 * Schedule content for future publishing through VIMO Social.
 */
export async function schedulePublish(params: PublishParams & { scheduledAt: string }): Promise<PublishResult> {
  const { postId, content, platform, scheduledAt, mediaUrls, metadata } = params;

  console.log(`[Publish] Scheduling post ${postId} on ${platform} for ${scheduledAt} via VIMO Social...`);

  try {
    const result = await vimoSocialPublish.schedule({
      postId,
      content,
      platforms: [platform],
      scheduledAt,
      mediaUrls,
      metadata,
    });

    const platformResult = result.platformResults[platform];

    if (platformResult && platformResult.success) {
      return {
        success: true,
        platformPostId: platformResult.platformPostId,
      };
    }

    return {
      success: false,
      error: `We had trouble scheduling your post for ${getPlatformLabel(platform)}. Please try again.`,
    };
  } catch (err) {
    console.error(`[Publish] Failed to schedule to ${platform}:`, err);
    return {
      success: false,
      error: `Something went wrong while scheduling. Please try again.`,
    };
  }
}

/**
 * Publish the same content to multiple platforms through VIMO Social.
 */
export async function publishToMultiplePlatforms(
  postId: string,
  content: string,
  platforms: string[],
  mediaUrls?: string[],
  scheduledAt?: string,
): Promise<{ results: Record<string, PublishResult>; allSuccess: boolean }> {
  console.log(`[Publish] Publishing to multiple platforms: ${platforms.join(', ')} via VIMO Social...`);

  try {
    const result = await vimoSocialPublish.publish({
      postId,
      content,
      platforms,
      mediaUrls,
      scheduledAt,
    });

    const results: Record<string, PublishResult> = {};
    for (const platform of platforms) {
      const pr = result.platformResults[platform];
      results[platform] = pr
        ? {
            success: pr.success,
            platformPostId: pr.platformPostId,
            error: pr.error,
          }
        : {
            success: false,
            error: `Unable to publish to ${getPlatformLabel(platform)}.`,
          };
    }

    return {
      results,
      allSuccess: Object.values(results).every((r) => r.success),
    };
  } catch (err) {
    console.error(`[Publish] Multi-platform publish failed:`, err);
    const results: Record<string, PublishResult> = {};
    for (const platform of platforms) {
      results[platform] = {
        success: false,
        error: `Something went wrong. Please try again.`,
      };
    }
    return { results, allSuccess: false };
  }
}

/**
 * Check VIMO Social connection health.
 */
export async function checkPublishHealth(): Promise<{ connected: boolean; message: string }> {
  return vimoSocialPublish.healthCheck();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    x: 'X',
    twitter: 'X',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    pinterest: 'Pinterest',
    threads: 'Threads',
    bluesky: 'Bluesky',
    reddit: 'Reddit',
    wordpress: 'WordPress',
    medium: 'Medium',
  };
  return labels[platform] || platform;
}

/**
 * Convert technical errors to user-friendly messages.
 * Never expose OAuth, tokens, or API details.
 */
function getFriendlyErrorMessage(platform: string, _technicalError: string): string {
  const platformLabel = getPlatformLabel(platform);

  // Generic user-friendly messages based on common error patterns
  const lower = _technicalError.toLowerCase();

  if (lower.includes('token') || lower.includes('auth') || lower.includes('oauth') || lower.includes('unauthorized') || lower.includes('401')) {
    return `We need you to reconnect ${platformLabel}. Please go to Social Accounts and reconnect.`;
  }
  if (lower.includes('rate') || lower.includes('limit') || lower.includes('429')) {
    return `${platformLabel} is receiving too many requests right now. Please wait a moment and try again.`;
  }
  if (lower.includes('permission') || lower.includes('scope') || lower.includes('access')) {
    return `VIMO needs updated permissions for ${platformLabel}. Please reconnect in Social Accounts.`;
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econn')) {
    return `Unable to reach ${platformLabel}. Please check your internet connection and try again.`;
  }

  return `We had trouble publishing to ${platformLabel}. Please try again.`;
}
