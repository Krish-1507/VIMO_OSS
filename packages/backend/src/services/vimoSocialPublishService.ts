import axios from 'axios';
import { db } from '../db';
import { connectors } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as credentialStore from '../lib/credentialStore';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { getOAuthAppCredentials } from '../lib/oauthManager';
import { createLogger } from '../lib/logger';

const log = createLogger('social:publish');

const registry = new ConnectorRegistry(db);

export interface VimoSocialPublishParams {
  postId: string;
  content: string;
  platforms: string[];
  mediaUrls?: string[];
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
}

export interface VimoSocialPublishResult {
  success: boolean;
  platformResults: Record<string, { success: boolean; platformPostId?: string; error?: string }>;
  error?: string;
}

export interface VimoSocialAccount {
  id: string;
  platform: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  followerCount: number;
  isConnected: boolean;
  platformAccountId?: string;
  health?: 'good' | 'warning' | 'error';
  healthMessage?: string;
  permissions?: string[];
}

function mapFacebookError(err: any): string {
  const fbErr = err?.response?.data?.error;
  const code = fbErr?.code ?? fbErr?.error_subcode;
  const msg = fbErr?.message || err?.message || 'Instagram API error while publishing.';
  if (code === 190) return 'Your Instagram access token has expired. Reconnect your Instagram account in Social Accounts.';
  if (code === 100) return 'The image URL is not publicly accessible. Instagram requires images hosted at a public URL.';
  if (code === 9) return 'Instagram rate limit reached. This post will be retried automatically.';
  return msg;
}

class VimoSocialPublishIntegration {
  async publish(params: VimoSocialPublishParams): Promise<VimoSocialPublishResult> {
    const { postId, content, platforms, mediaUrls, scheduledAt, metadata } = params;

    console.log(`[VimoSocialPublish] Publishing post ${postId} to ${platforms.join(', ')}...`);

    const platformResults: Record<string, { success: boolean; platformPostId?: string; error?: string }> = {};

    for (const platform of platforms) {
      try {
        const allConnectors = await registry.getAll();
        const providerKey =
          platform === 'instagram' ? 'instagram_facebook' : platform === 'twitter' ? 'x' : platform;
        const platformConnector = allConnectors.find(
          (c) => c.provider === providerKey && c.status === 'active'
        );

        if (!platformConnector) {
          platformResults[platform] = {
            success: false,
            error: `${platform} is not connected. Please connect it in Social Accounts.`,
          };
          continue;
        }

        const accessToken = await credentialStore.getCredential(platformConnector.id, 'accessToken');
        // Bluesky authenticates with an app password (handle + appPassword)
        // rather than an OAuth access token, so it is exempt from this check.
        if (!accessToken && platform !== 'bluesky') {
          platformResults[platform] = {
            success: false,
            error: `${platform} token expired. Please reconnect.`,
          };
          continue;
        }

        const result = await this.publishToPlatform(platform, {
          accessToken: accessToken || '',
          connectorId: platformConnector.id,
          content,
          mediaUrls,
          scheduledAt,
          metadata,
        });

        platformResults[platform] = result;
      } catch (err: any) {
        const message = err?.message || 'Unknown error';
        platformResults[platform] = { success: false, error: message };
        console.error(`[VimoSocialPublish] Failed to publish to ${platform}: ${message}`);
      }
    }

    const allSuccess = Object.values(platformResults).every((r) => r.success);
    return {
      success: allSuccess,
      platformResults,
      error: allSuccess ? undefined : 'One or more platforms failed',
    };
  }

  private async publishToPlatform(
    platform: string,
    opts: {
      accessToken: string;
      connectorId: string;
      content: string;
      mediaUrls?: string[];
      scheduledAt?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    switch (platform) {
      case 'instagram':
        return this.publishToInstagram(opts);
      case 'facebook':
        return this.publishToFacebook(opts);
      case 'linkedin':
        return this.publishToLinkedIn(opts);
      case 'x':
      case 'twitter':
        return this.publishToX(opts);
      case 'threads':
        return this.publishToThreads(opts);
      case 'reddit':
        return this.publishToReddit(opts);
      case 'medium':
        return this.publishToMedium(opts);
      case 'bluesky':
        return this.publishToBluesky(opts);
      case 'tiktok':
        return {
          success: false,
          error: 'TikTok only accepts video/photo posts via API. Attach a video or use the TikTok app to publish.',
        };
      case 'youtube':
        return {
          success: false,
          error: 'YouTube requires a video file upload. Attach a video, or use YouTube Studio to publish.',
        };
      case 'pinterest':
        return {
          success: false,
          error: 'Pinterest requires a board. Connect a board in Social Accounts to enable pin publishing.',
        };
      default:
        return { success: false, error: `Unsupported platform: ${platform}` };
    }
  }

  private async publishToThreads(opts: {
    accessToken: string; connectorId?: string; content: string;
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    const userId = await credentialStore.getCredential(opts.connectorId || '', 'threadsUserId');
    if (!userId) {
      return { success: false, error: 'Threads account not fully connected. Please reconnect.' };
    }
    const containerRes = await axios.post(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      null,
      {
        params: {
          media_type: 'TEXT',
          text: opts.content,
          access_token: opts.accessToken,
        },
      },
    );
    const containerId = containerRes.data?.id;
    if (!containerId) return { success: false, error: 'Failed to create Threads post container.' };

    const publishRes = await axios.post(
      `https://graph.threads.net/v1.0/${containerId}/publish`,
      null,
      { params: { access_token: opts.accessToken } },
    );
    const postId = String(publishRes.data?.id || '');
    return postId
      ? { success: true, platformPostId: postId }
      : { success: false, error: 'Threads publish did not return a post ID.' };
  }

  private async publishToReddit(opts: {
    accessToken: string; content: string; metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    const res = await axios.post(
      'https://oauth.reddit.com/api/submit',
      new URLSearchParams({
        kind: 'self',
        sr: opts.metadata?.subreddit?.toString() || 'test',
        title: (opts.content.split('\n')[0] || 'VIMO post').slice(0, 300),
        text: opts.content,
        api_type: 'json',
      }).toString(),
      {
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VIMO/1.0 (social connector)',
        },
      },
    );
    const postId = res.data?.json?.data?.id || res.data?.data?.id;
    return postId
      ? { success: true, platformPostId: String(postId) }
      : { success: false, error: 'Reddit publish did not return a post ID.' };
  }

  private async publishToMedium(opts: {
    accessToken: string; content: string;
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    const meRes = await axios.get('https://api.medium.com/v1/me', {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    const userId = meRes.data?.data?.id;
    if (!userId) return { success: false, error: 'Could not resolve Medium user.' };
    const res = await axios.post(
      `https://api.medium.com/v1/users/${userId}/posts`,
      {
        title: (opts.content.split('\n')[0] || 'VIMO post').slice(0, 100),
        contentFormat: 'markdown',
        content: opts.content,
        publishStatus: 'draft',
      },
      { headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' } },
    );
    const postId = res.data?.data?.id;
    return postId
      ? { success: true, platformPostId: String(postId) }
      : { success: false, error: 'Medium publish did not return a post ID.' };
  }

  private async publishToBluesky(opts: {
    accessToken?: string;
    connectorId?: string;
    content: string;
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    if (!opts.connectorId) {
      return { success: false, error: 'Bluesky connector not found.' };
    }
    const handle = await credentialStore.getCredential(opts.connectorId, 'handle');
    const appPassword = await credentialStore.getCredential(opts.connectorId, 'appPassword');
    if (!handle || !appPassword) {
      return { success: false, error: 'Bluesky handle or app password missing. Please reconnect.' };
    }

    // 1) Create an authenticated session with the app password.
    let session: { did: string; accessJwt: string };
    try {
      const sessionRes = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
        identifier: handle,
        password: appPassword,
      });
      session = { did: sessionRes.data.did, accessJwt: sessionRes.data.accessJwt };
    } catch (err: any) {
      return {
        success: false,
        error: `Bluesky authentication failed: ${err?.response?.data?.message || err?.message || 'invalid credentials'}`,
      };
    }

    // 2) Create the post record (text only — AT Protocol posts carry text;
    //    media would require a binary blob upload which is out of scope here).
    try {
      const now = new Date().toISOString();
      const recordRes = await axios.post(
        'https://bsky.social/xrpc/com.atproto.repo.createRecord',
        {
          repo: session.did,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: opts.content.substring(0, 300),
            createdAt: now,
          },
        },
        { headers: { Authorization: `Bearer ${session.accessJwt}` } }
      );
      const uri = String(recordRes.data?.uri || '');
      return uri ? { success: true, platformPostId: uri } : { success: false, error: 'Bluesky did not return a post URI.' };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to publish to Bluesky: ${err?.response?.data?.message || err?.message || 'unknown error'}`,
      };
    }
  }

  private async publishToInstagram(opts: {
    accessToken: string; connectorId: string; content: string; mediaUrls?: string[]; metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    const igAccountId = await credentialStore.getCredential(opts.connectorId, 'instagramAccountId');
    if (!igAccountId) {
      return { success: false, error: 'Instagram account ID not found. Please reconnect.' };
    }
    const imageUrl = opts.mediaUrls?.[0];
    if (!imageUrl) {
      return { success: false, error: 'Instagram image posts require an image URL.' };
    }

    const mediaType =
      (opts.metadata?.mediaType as string) === 'REELS'
        ? 'REELS'
        : (opts.metadata?.mediaType as string) === 'STORIES'
        ? 'STORIES'
        : 'IMAGE';

    let containerRes: any;
    try {
      containerRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igAccountId}/media`,
        {
          image_url: imageUrl,
          caption: opts.content,
          access_token: opts.accessToken,
          ...(mediaType === 'REELS'
            ? { media_type: 'REELS', video_url: imageUrl, share_to_feed: true }
            : {}),
        }
      );
    } catch (err) {
      return { success: false, error: mapFacebookError(err) };
    }

    const containerId = containerRes.data?.id;
    if (!containerId) return { success: false, error: 'Failed to create Instagram media container.' };

    // Poll the container until it is ready (Instagram processes asynchronously).
    const start = Date.now();
    const timeoutMs = 5 * 60 * 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let statusCode: string | undefined;
      try {
        const statusRes = await axios.get(`https://graph.facebook.com/v19.0/${containerId}`, {
          params: { fields: 'status_code', access_token: opts.accessToken },
        });
        statusCode = statusRes.data?.status_code;
      } catch (err) {
        return { success: false, error: mapFacebookError(err) };
      }

      if (statusCode === 'FINISHED') break;
      if (statusCode === 'ERROR') {
        return { success: false, error: 'Instagram could not process the media. Make sure the image URL is publicly accessible.' };
      }
      if (Date.now() - start > timeoutMs) {
        return { success: false, error: 'Timed out preparing the Instagram post. Please try again.' };
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    let publishRes: any;
    try {
      publishRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
        { creation_id: containerId, access_token: opts.accessToken }
      );
    } catch (err) {
      return { success: false, error: mapFacebookError(err) };
    }
    const postId = String(publishRes.data?.id || '');
    return postId
      ? { success: true, platformPostId: postId }
      : { success: false, error: 'Instagram publish did not return a post ID.' };
  }

  private async publishToFacebook(opts: {
    accessToken: string; content: string; mediaUrls?: string[];
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { access_token: opts.accessToken },
    });
    const page = pagesRes.data?.data?.[0];
    if (!page?.id) return { success: false, error: 'No Facebook page found.' };

    const body: Record<string, any> = {
      message: opts.content,
      access_token: opts.accessToken,
    };
    if (opts.mediaUrls?.length) {
      body.link = opts.mediaUrls[0];
    }
    const res = await axios.post(`https://graph.facebook.com/v19.0/${page.id}/feed`, body);
    const postId = String(res.data?.id || '');
    return postId
      ? { success: true, platformPostId: postId }
      : { success: false, error: 'Facebook publish did not return a post ID.' };
  }

  private async publishToLinkedIn(opts: {
    accessToken: string; content: string; mediaUrls?: string[];
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    });
    const sub = profileRes.data?.sub;
    if (!sub) return { success: false, error: 'LinkedIn profile not found.' };

    const res = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: `urn:li:person:${sub}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: opts.content },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      },
      { headers: { Authorization: `Bearer ${opts.accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }
    );
    const postId = res.data?.id;
    return postId
      ? { success: true, platformPostId: postId }
      : { success: false, error: 'LinkedIn publish did not return a post ID.' };
  }

  private async publishToX(opts: {
    accessToken: string; content: string;
  }): Promise<{ success: boolean; platformPostId?: string; error?: string }> {
    const res = await axios.post(
      'https://api.x.com/2/tweets',
      { text: opts.content.substring(0, 280) },
      { headers: { Authorization: `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json' } }
    );
    const postId = res.data?.data?.id;
    return postId
      ? { success: true, platformPostId: postId }
      : { success: false, error: 'X publish did not return a post ID.' };
  }

  async schedule(params: VimoSocialPublishParams & { scheduledAt: string }): Promise<VimoSocialPublishResult> {
    return this.publish(params);
  }

  async getAccounts(): Promise<VimoSocialAccount[]> {
    const all = await registry.getAll();
    const socialConnectors = all.filter((c) => c.type === 'social' || c.provider === 'vmosocial');
    const platformOf = (provider: string): string => {
      if (provider === 'instagram_facebook' || provider === 'instagram') return 'instagram';
      if (provider === 'twitter') return 'x';
      return provider;
    };

    const accounts: VimoSocialAccount[] = [];
    for (const conn of socialConnectors) {
      const accessToken = await credentialStore.getCredential(conn.id, 'accessToken');
      const platform = platformOf(conn.provider);

      // Bluesky uses an app password, not an OAuth access token.
      if (conn.provider === 'bluesky') {
        try {
          const info = await this.fetchBlueskyInfo(conn.id);
          accounts.push({ ...info, platform: 'bluesky', isConnected: true });
        } catch {
          accounts.push(this.errorAccount(conn, 'bluesky', 'Could not authenticate. Please reconnect.'));
        }
        continue;
      }

      if (!accessToken) {
        accounts.push(this.errorAccount(conn, platform, 'No access token. Please reconnect.'));
        continue;
      }

      try {
        switch (platform) {
          case 'instagram': {
            const igAccountId = await credentialStore.getCredential(conn.id, 'instagramAccountId');
            if (igAccountId) {
              const info = await this.fetchInstagramInfo(igAccountId, accessToken);
              accounts.push({ ...info, platform: 'instagram', isConnected: true });
            } else {
              accounts.push(this.errorAccount(conn, 'instagram', 'Connected Instagram is not a Business/Creator account. Switch account type to see stats.'));
            }
            break;
          }
          case 'facebook': {
            const info = await this.fetchFacebookInfo(accessToken);
            accounts.push({ ...info, platform: 'facebook', isConnected: true });
            break;
          }
          case 'linkedin': {
            const info = await this.fetchLinkedInInfo(accessToken);
            accounts.push({ ...info, platform: 'linkedin', isConnected: true });
            break;
          }
          case 'x': {
            const info = await this.fetchXInfo(accessToken);
            accounts.push({ ...info, platform: 'x', isConnected: true });
            break;
          }
          case 'tiktok': {
            const info = await this.fetchTikTokInfo(accessToken);
            accounts.push({ ...info, platform: 'tiktok', isConnected: true });
            break;
          }
          case 'youtube': {
            const info = await this.fetchYouTubeInfo(accessToken);
            accounts.push({ ...info, platform: 'youtube', isConnected: true });
            break;
          }
          case 'pinterest': {
            const info = await this.fetchPinterestInfo(accessToken);
            accounts.push({ ...info, platform: 'pinterest', isConnected: true });
            break;
          }
          case 'threads': {
            const info = await this.fetchThreadsInfo(accessToken);
            accounts.push({ ...info, platform: 'threads', isConnected: true });
            break;
          }
          case 'reddit': {
            const info = await this.fetchRedditInfo(accessToken);
            accounts.push({ ...info, platform: 'reddit', isConnected: true });
            break;
          }
          default:
            accounts.push(this.errorAccount(conn, platform, 'Unsupported platform.'));
        }
      } catch (err: any) {
        const message =
          err?.response?.status === 401 || err?.response?.status === 403
            ? 'Token expired or missing permissions. Please reconnect.'
            : 'Could not load account. Please reconnect.';
        accounts.push(this.errorAccount(conn, platform, message));
      }
    }

    return accounts;
  }

  private errorAccount(
    conn: { id: string; provider: string; name: string },
    platform: string,
    message: string,
  ): VimoSocialAccount {
    return {
      id: conn.id,
      platform,
      name: conn.name,
      isConnected: false,
      followerCount: 0,
      health: 'error',
      healthMessage: message,
    };
  }

  private async fetchInstagramInfo(igAccountId: string, accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${igAccountId}`, {
      params: { fields: 'username,followers_count,media_count,profile_picture_url', access_token: accessToken },
    });
    return {
      id: `ig-${igAccountId}`,
      platform: 'instagram',
      name: res.data?.username || 'Instagram Account',
      handle: `@${res.data?.username || ''}`,
      avatarUrl: res.data?.profile_picture_url,
      followerCount: Number(res.data?.followers_count || 0),
      isConnected: true,
      platformAccountId: igAccountId,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics', 'comments'],
    };
  }

  private async fetchFacebookInfo(accessToken: string): Promise<VimoSocialAccount> {
    const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { fields: 'id,name,followers_count,picture{url}', access_token: accessToken },
    });
    const page = pagesRes.data?.data?.[0];
    if (!page?.id) return {
      id: `fb-me`,
      platform: 'facebook',
      name: 'Facebook Page',
      isConnected: true,
      followerCount: 0,
      health: 'warning',
      healthMessage: 'No Facebook pages found for this account.',
    };
    return {
      id: `fb-${page.id}`,
      platform: 'facebook',
      name: page.name || 'Facebook Page',
      avatarUrl: page.picture?.data?.url,
      followerCount: Number(page.followers_count || 0),
      isConnected: true,
      platformAccountId: page.id,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics', 'comments'],
    };
  }

  private async fetchLinkedInInfo(accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      id: `li-${res.data?.sub || 'unknown'}`,
      platform: 'linkedin',
      name: res.data?.name || 'LinkedIn Account',
      handle: res.data?.preferred_username || '',
      avatarUrl: res.data?.picture,
      followerCount: 0,
      isConnected: true,
      platformAccountId: res.data?.sub,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics'],
    };
  }

  private async fetchXInfo(accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const user = res.data?.data || {};
    return {
      id: `x-${user.id || 'unknown'}`,
      platform: 'x',
      name: user.name || 'X Account',
      handle: user.username ? `@${user.username}` : '',
      followerCount: 0,
      isConnected: true,
      platformAccountId: user.id,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics'],
    };
  }

  private async fetchTikTokInfo(accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      params: { fields: 'open_id,username,display_name,avatar_url,follower_count,following_count,likes_count' },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const user = res.data?.data?.user || {};
    return {
      id: `tt-${user.open_id || 'unknown'}`,
      platform: 'tiktok',
      name: user.display_name || user.username || 'TikTok Account',
      handle: user.username ? `@${user.username}` : '',
      avatarUrl: user.avatar_url,
      followerCount: Number(user.follower_count || 0),
      isConnected: true,
      platformAccountId: user.open_id,
      health: 'good',
      permissions: ['analytics'],
    };
  }

  private async fetchYouTubeInfo(accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet,statistics', mine: true },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const channel = res.data?.items?.[0];
    if (!channel) return {
      id: `yt-me`,
      platform: 'youtube',
      name: 'YouTube Channel',
      isConnected: true,
      followerCount: 0,
      health: 'warning',
      healthMessage: 'No YouTube channel found for this account.',
    };
    return {
      id: `yt-${channel.id}`,
      platform: 'youtube',
      name: channel.snippet?.title || 'YouTube Channel',
      avatarUrl: channel.snippet?.thumbnails?.default?.url,
      followerCount: Number(channel.statistics?.subscriberCount || 0),
      isConnected: true,
      platformAccountId: channel.id,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics'],
    };
  }

  private async fetchPinterestInfo(accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      id: `pin-${res.data?.username || 'unknown'}`,
      platform: 'pinterest',
      name: res.data?.username || 'Pinterest Account',
      handle: res.data?.username ? `@${res.data.username}` : '',
      followerCount: 0,
      isConnected: true,
      platformAccountId: res.data?.username,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics'],
    };
  }

  private async fetchThreadsInfo(accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get('https://graph.threads.net/v1.0/me', {
      params: { fields: 'id,username,threads_biography', access_token: accessToken },
    });
    return {
      id: `th-${res.data?.id || 'unknown'}`,
      platform: 'threads',
      name: res.data?.username || 'Threads Account',
      handle: res.data?.username ? `@${res.data.username}` : '',
      followerCount: 0,
      isConnected: true,
      platformAccountId: res.data?.id,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics', 'comments'],
    };
  }

  private async fetchRedditInfo(accessToken: string): Promise<VimoSocialAccount> {
    const res = await axios.get('https://oauth.reddit.com/api/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'VIMO/1.0 (social connector)' },
    });
    return {
      id: `rd-${res.data?.name || 'unknown'}`,
      platform: 'reddit',
      name: res.data?.name || 'Reddit Account',
      handle: res.data?.name ? `u/${res.data.name}` : '',
      followerCount: Number(res.data?.total_karma || 0),
      isConnected: true,
      platformAccountId: res.data?.name,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics'],
    };
  }

  private async fetchBlueskyInfo(connectorId: string): Promise<VimoSocialAccount> {
    const handle = await credentialStore.getCredential(connectorId, 'handle');
    const appPassword = await credentialStore.getCredential(connectorId, 'appPassword');
    if (!handle || !appPassword) throw new Error('Missing Bluesky credentials');
    const sessionRes = await axios.post(
      'https://bsky.social/xrpc/com.atproto.server.createSession',
      { identifier: handle, password: appPassword },
    );
    const session = sessionRes.data;
    return {
      id: `bsky-${session.did}`,
      platform: 'bluesky',
      name: session.handle || handle,
      handle: session.handle ? `@${session.handle}` : handle,
      avatarUrl: session.avatar,
      followerCount: 0,
      isConnected: true,
      platformAccountId: session.did,
      health: 'good',
      permissions: ['publish', 'schedule', 'analytics'],
    };
  }

  async getConnectedPlatforms(): Promise<{ platform: string; platformName: string; isConnected: boolean; accountName?: string }[]> {
    const platforms = [
      { id: 'instagram', name: 'Instagram' },
      { id: 'facebook', name: 'Facebook' },
      { id: 'linkedin', name: 'LinkedIn' },
      { id: 'x', name: 'X' },
      { id: 'tiktok', name: 'TikTok' },
      { id: 'youtube', name: 'YouTube' },
      { id: 'pinterest', name: 'Pinterest' },
      { id: 'threads', name: 'Threads' },
      { id: 'bluesky', name: 'Bluesky' },
    ];

    const all = await registry.getAll();
    const result: { platform: string; platformName: string; isConnected: boolean; accountName?: string }[] = [];

    for (const p of platforms) {
      const conn = all.find((c) => {
        const provider = c.provider;
        return provider === p.id || (p.id === 'instagram' && (provider === 'instagram_facebook' || provider === 'instagram'));
      });
      if (conn && conn.status === 'active') {
        result.push({ platform: p.id, platformName: p.name, isConnected: true, accountName: conn.name });
      } else {
        result.push({ platform: p.id, platformName: p.name, isConnected: false });
      }
    }

    return result;
  }

  async healthCheck(): Promise<{ connected: boolean; message: string }> {
    try {
      const all = await registry.getAll();
      const socialConnectors = all.filter((c) => c.type === 'social');
      if (socialConnectors.length === 0) {
        return { connected: false, message: 'No social accounts connected.' };
      }
      const activeCount = socialConnectors.filter((c) => c.status === 'active').length;
      return {
        connected: activeCount > 0,
        message: activeCount > 0
          ? `${activeCount} social account(s) active`
          : 'Social accounts configured but inactive.',
      };
    } catch {
      return { connected: false, message: 'VIMO Social connection failed' };
    }
  }
}

export const vimoSocialPublish = new VimoSocialPublishIntegration();

/* ------------------------------------------------------------------ */
/*  Post-OAuth enrichment                                              */
/*                                                                    */
/*  After a successful OAuth handshake we fetch the sub-account ids   */
/*  each platform needs to actually publish and read analytics        */
/*  (e.g. an Instagram Business account id, a Facebook page id, a     */
/*  Threads user id). Without these, "connected" accounts would show  */
/*  up empty. Failures are logged but never break the connection.     */
/* ------------------------------------------------------------------ */

async function getAppCreds(provider: string): Promise<{ clientId?: string; clientSecret?: string } | null> {
  const creds = await getOAuthAppCredentials();
  return (creds as any)[provider] || null;
}

export async function enrichConnectorAfterOAuth(
  connectorId: string,
  provider: string,
  accessToken: string,
): Promise<void> {
  try {
    switch (provider) {
      case 'instagram_facebook':
        await enrichMeta(connectorId, accessToken, false);
        break;
      case 'facebook':
        await enrichMeta(connectorId, accessToken, true);
        break;
      case 'linkedin':
        await enrichLinkedIn(connectorId, accessToken);
        break;
      case 'x':
      case 'twitter':
        await enrichX(connectorId, accessToken);
        break;
      case 'tiktok':
        await enrichTikTok(connectorId, accessToken);
        break;
      case 'youtube':
        await enrichYouTube(connectorId, accessToken);
        break;
      case 'pinterest':
        await enrichPinterest(connectorId, accessToken);
        break;
      case 'threads':
        await enrichThreads(connectorId, accessToken);
        break;
      case 'reddit':
        await enrichReddit(connectorId, accessToken);
        break;
      case 'bluesky':
        await enrichBluesky(connectorId);
        break;
      default:
        break;
    }
  } catch (err) {
    log.error('OAuth enrichment failed', { provider, err: (err as Error).message });
  }
}

async function enrichMeta(connectorId: string, accessToken: string, facebookOnly: boolean): Promise<void> {
  const appCreds = await getAppCreds('instagram_facebook');
  let longLived = accessToken;
  if (appCreds?.clientId && appCreds?.clientSecret) {
    try {
      const ex = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appCreds.clientId,
          client_secret: appCreds.clientSecret,
          fb_exchange_token: accessToken,
        },
      });
      if (ex.data?.access_token) {
        longLived = ex.data.access_token;
        await credentialStore.storeCredential(connectorId, 'accessToken', longLived);
      }
    } catch {
      log.warn('FB long-lived token exchange failed; using short-lived token');
    }
  }

  const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
    params: {
      fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}',
      access_token: longLived,
    },
  });
  const pages: any[] = pagesRes.data?.data || [];
  const igPage = pages.find((p) => p.instagram_business_account?.id);
  const chosen = igPage || pages[0];
  if (!chosen) return;

  await credentialStore.storeCredential(connectorId, 'facebookPageId', chosen.id);
  if (chosen.access_token) {
    await credentialStore.storeCredential(connectorId, 'facebookPageAccessToken', chosen.access_token);
  }
  if (!facebookOnly && igPage?.instagram_business_account) {
    const ig = igPage.instagram_business_account;
    await credentialStore.storeCredential(connectorId, 'instagramAccountId', ig.id);
    if (ig.username) await credentialStore.storeCredential(connectorId, 'instagramUsername', ig.username);
  }
}

async function enrichLinkedIn(connectorId: string, accessToken: string): Promise<void> {
  const res = await axios.get('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.data?.sub) await credentialStore.storeCredential(connectorId, 'linkedinUserId', res.data.sub);
  if (res.data?.name) await credentialStore.storeCredential(connectorId, 'linkedinName', res.data.name);
}

async function enrichX(connectorId: string, accessToken: string): Promise<void> {
  const res = await axios.get('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = res.data?.data || {};
  if (user.id) await credentialStore.storeCredential(connectorId, 'xUserId', user.id);
  if (user.username) await credentialStore.storeCredential(connectorId, 'xUsername', user.username);
}

async function enrichTikTok(connectorId: string, accessToken: string): Promise<void> {
  const res = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
    params: { fields: 'open_id,username,display_name,avatar_url,follower_count' },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = res.data?.data?.user || {};
  if (user.open_id) await credentialStore.storeCredential(connectorId, 'tiktokOpenId', user.open_id);
  if (user.username) await credentialStore.storeCredential(connectorId, 'tiktokUsername', user.username);
}

async function enrichYouTube(connectorId: string, accessToken: string): Promise<void> {
  const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet', mine: true },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const channel = res.data?.items?.[0];
  if (channel?.id) await credentialStore.storeCredential(connectorId, 'youtubeChannelId', channel.id);
}

async function enrichPinterest(connectorId: string, accessToken: string): Promise<void> {
  const res = await axios.get('https://api.pinterest.com/v5/user_account', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.data?.username) await credentialStore.storeCredential(connectorId, 'pinterestUsername', res.data.username);
}

async function enrichThreads(connectorId: string, accessToken: string): Promise<void> {
  const res = await axios.get('https://graph.threads.net/v1.0/me', {
    params: { fields: 'id,username', access_token: accessToken },
  });
  if (res.data?.id) await credentialStore.storeCredential(connectorId, 'threadsUserId', res.data.id);
  if (res.data?.username) await credentialStore.storeCredential(connectorId, 'threadsUsername', res.data.username);
}

async function enrichReddit(connectorId: string, accessToken: string): Promise<void> {
  const res = await axios.get('https://oauth.reddit.com/api/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'VIMO/1.0 (social connector)' },
  });
  if (res.data?.name) await credentialStore.storeCredential(connectorId, 'redditUsername', res.data.name);
}

async function enrichBluesky(connectorId: string): Promise<void> {
  const handle = await credentialStore.getCredential(connectorId, 'handle');
  const appPassword = await credentialStore.getCredential(connectorId, 'appPassword');
  if (!handle || !appPassword) return;
  const res = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
    identifier: handle,
    password: appPassword,
  });
  if (res.data?.did) await credentialStore.storeCredential(connectorId, 'blueskyDid', res.data.did);
  if (res.data?.handle) await credentialStore.storeCredential(connectorId, 'blueskyHandle', res.data.handle);
}
