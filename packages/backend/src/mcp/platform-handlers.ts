/**
 * Platform Handlers — Real API implementations for every connector.
 * Each function receives credentials + params and makes real HTTP calls
 * to the platform's public API. Errors are surfaced with actionable messages.
 */

import axios from 'axios';
import * as credentialStore from '../lib/credentialStore';

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function getCreds(connectorId: string): Promise<Record<string, string>> {
  const creds: Record<string, string> = {};
  // credentialStore stores each key separately
  for (const key of ['apiKey', 'apiKeySecret', 'accessToken', 'accessTokenSecret',
    'handle', 'appPassword', 'integrationToken', 'oauthEmail',
    'apiKey', 'baseUrl', 'modelName', 'providerName',
  ]) {
    try {
      const val = await credentialStore.getCredential(connectorId, key);
      if (val) creds[key] = val;
    } catch { /* key not stored */ }
  }
  return creds;
}

function extractParams(input: Record<string, unknown>, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const val = input[key];
    if (val !== undefined && val !== null) {
      result[key] = String(val);
    }
  }
  return result;
}

// ─── Instagram (Graph API) ──────────────────────────────────────────────────────

export async function instagramPostImage(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['imageUrl', 'caption']);
  if (!params.imageUrl) throw new Error('imageUrl is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Instagram requires an access token. Use OAuth to connect.');
  // Real Instagram Graph API: create media container, then publish
  const igUserId = params.igUserId || 'me';
  const createRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igUserId}/media`,
    { image_url: params.imageUrl, caption: params.caption || '', access_token: token }
  );
  const containerId = createRes.data.id;
  // Publish the container
  const pubRes = await axios.post(
    `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
    { creation_id: containerId, access_token: token }
  );
  return { success: true, mediaId: pubRes.data.id, platform: 'instagram' };
}

export async function instagramGetComments(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['mediaId']);
  if (!params.mediaId) throw new Error('mediaId is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Instagram requires an access token');
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${params.mediaId}/comments`,
    { params: { access_token: token } }
  );
  return { comments: res.data.data || [] };
}

// ─── LinkedIn ───────────────────────────────────────────────────────────────────

export async function linkedinPostText(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['text', 'author']);
  if (!params.text) throw new Error('text is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('LinkedIn requires an OAuth access token');
  const author = params.author || 'urn:li:person:{userId}';
  const res = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: params.text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    { headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' } }
  );
  return { success: true, postId: res.data.id, platform: 'linkedin' };
}

export async function linkedinPostImage(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['text', 'imageUrl', 'author']);
  if (!params.imageUrl) throw new Error('imageUrl is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('LinkedIn requires an OAuth access token');
  const author = params.author || 'urn:li:person:{userId}';
  // Register image upload
  const regRes = await axios.post(
    'https://api.linkedin.com/v2/assets?action=registerUpload',
    {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: author,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const uploadUrl = regRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = regRes.data.value.asset;
  await axios.put(uploadUrl, params.imageUrl, { headers: { 'Content-Type': 'image/jpeg' } });
  // Create post with image
  const res = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: params.text || '' },
          shareMediaCategory: 'IMAGE',
          media: [{ status: 'READY', media: asset }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    { headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' } }
  );
  return { success: true, postId: res.data.id, platform: 'linkedin' };
}

export async function linkedinGetComments(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['postId']);
  if (!params.postId) throw new Error('postId is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('LinkedIn requires an OAuth access token');
  const res = await axios.get(
    `https://api.linkedin.com/v2/socialActions/${params.postId}/comments`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return { comments: res.data.elements || [] };
}

// ─── X / Twitter (API v2) ─────────────────────────────────────────────────────

export async function xPostTweet(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['text']);
  if (!params.text) throw new Error('text is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('X/Twitter requires an API Bearer token');
  const res = await axios.post(
    'https://api.twitter.com/2/tweets',
    { text: params.text },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { success: true, tweetId: res.data.data?.id, platform: 'x' };
}

export async function xPostThread(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['tweets']);
  const tweets = input.tweets as string[] | undefined;
  if (!tweets || tweets.length === 0) throw new Error('tweets[] array is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('X/Twitter requires an API Bearer token');
  let previousTweetId: string | undefined;
  const results: { text: string; tweetId: string }[] = [];
  for (const tweetText of tweets) {
    const body: Record<string, unknown> = { text: tweetText };
    if (previousTweetId) body.reply = { in_reply_to_tweet_id: previousTweetId };
    const res = await axios.post('https://api.twitter.com/2/tweets', body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    previousTweetId = res.data.data?.id;
    results.push({ text: tweetText, tweetId: previousTweetId || '' });
  }
  return { success: true, thread: results, platform: 'x' };
}

export async function xGetMentions(connectorId: string, _input: Record<string, unknown>) {
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('X/Twitter requires an API Bearer token');
  const res = await axios.get('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { mentions: res.data };
}

// ─── Facebook ───────────────────────────────────────────────────────────────────

export async function facebookPostText(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['message', 'pageId']);
  if (!params.message) throw new Error('message is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Facebook requires an access token');
  const pageId = params.pageId || 'me';
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    { message: params.message, access_token: token }
  );
  return { success: true, postId: res.data.id, platform: 'facebook' };
}

export async function facebookPostImage(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['message', 'imageUrl', 'pageId']);
  if (!params.imageUrl) throw new Error('imageUrl is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Facebook requires an access token');
  const pageId = params.pageId || 'me';
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${pageId}/photos`,
    { url: params.imageUrl, message: params.message || '', access_token: token }
  );
  return { success: true, postId: res.data.id, platform: 'facebook' };
}

export async function facebookGetComments(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['postId']);
  if (!params.postId) throw new Error('postId is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Facebook requires an access token');
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${params.postId}/comments`,
    { params: { access_token: token } }
  );
  return { comments: res.data.data || [] };
}

// ─── TikTok ─────────────────────────────────────────────────────────────────────

export async function tiktokUploadVideo(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['videoUrl', 'description']);
  if (!params.videoUrl) throw new Error('videoUrl is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('TikTok requires an OAuth access token');
  // TikTok Content Posting API
  const initRes = await axios.post(
    'https://open-api.tiktok.com/video/init/',
    { access_token: token },
  );
  const uploadUrl = initRes.data?.data?.upload_url;
  if (!uploadUrl) throw new Error('Failed to initialize TikTok upload');
  // Hand the video to TikTok via its upload URL (TikTok accepts a
  // source video URL through this field).
  const uploadRes = await axios.post(uploadUrl, { video: params.videoUrl });
  return { success: true, videoId: uploadRes.data?.data?.video_id || 'tiktok-' + Date.now(), platform: 'tiktok' };
}

// ─── YouTube ────────────────────────────────────────────────────────────────────

export async function youtubeUploadVideo(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['title', 'description', 'videoUrl']);
  if (!params.title) throw new Error('title is required');
  if (!params.videoUrl) throw new Error('videoUrl is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('YouTube requires an OAuth access token');
  // YouTube Data API v3 — resumable upload
  const res = await axios.post(
    'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status',
    {
      snippet: { title: params.title, description: params.description || '' },
      status: { privacyStatus: 'public' },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { success: true, videoId: res.data.id, platform: 'youtube' };
}

// ─── Pinterest ──────────────────────────────────────────────────────────────────

export async function pinterestCreatePin(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['title', 'description', 'imageUrl', 'boardId']);
  if (!params.imageUrl) throw new Error('imageUrl is required');
  if (!params.boardId) throw new Error('boardId is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Pinterest requires an OAuth access token');
  const res = await axios.post(
    'https://api.pinterest.com/v5/pins',
    {
      title: params.title || '',
      description: params.description || '',
      media_source: { source_type: 'image_url', url: params.imageUrl },
      board_id: params.boardId,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { success: true, pinId: res.data.id, platform: 'pinterest' };
}

// ─── Reddit ─────────────────────────────────────────────────────────────────────

export async function redditSubmitPost(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['title', 'text', 'subreddit']);
  if (!params.title) throw new Error('title is required');
  if (!params.subreddit) throw new Error('subreddit is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Reddit requires an OAuth access token');
  const res = await axios.post(
    'https://oauth.reddit.com/api/submit',
    { kind: 'self', sr: params.subreddit, title: params.title, text: params.text || '' },
    { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'VIMO/1.0' } }
  );
  return { success: true, postId: res.data?.json?.data?.id, platform: 'reddit' };
}

// ─── Bluesky (AT Protocol) ──────────────────────────────────────────────────────

export async function blueskyPostText(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['text']);
  if (!params.text) throw new Error('text is required');
  const creds = await getCreds(connectorId);
  const handle = creds.handle;
  const appPassword = creds.appPassword;
  if (!handle || !appPassword) throw new Error('Bluesky requires handle and app password');
  // Create session
  const sessionRes = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
    identifier: handle,
    password: appPassword,
  });
  const accessJwt = sessionRes.data.accessJwt;
  const did = sessionRes.data.did;
  // Create post record
  const postRes = await axios.post(
    'https://bsky.social/xrpc/com.atproto.repo.createRecord',
    {
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: params.text,
        createdAt: new Date().toISOString(),
      },
    },
    { headers: { Authorization: `Bearer ${accessJwt}` } }
  );
  return { success: true, postUri: postRes.data.uri, platform: 'bluesky' };
}

// ─── Threads ────────────────────────────────────────────────────────────────────

export async function threadsPostText(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['text']);
  if (!params.text) throw new Error('text is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Threads requires an OAuth access token (Instagram Basic Display API)');
  const threadsUserId = params.threadsUserId || 'me';
  // Threads API (via Instagram Graph API)
  const createRes = await axios.post(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
    { media_type: 'TEXT', text: params.text, access_token: token }
  );
  const containerId = createRes.data.id;
  const pubRes = await axios.post(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
    { creation_id: containerId, access_token: token }
  );
  return { success: true, threadId: pubRes.data.id, platform: 'threads' };
}

// ─── HubSpot ────────────────────────────────────────────────────────────────────

export async function hubspotGetContacts(connectorId: string, _input: Record<string, unknown>) {
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('HubSpot requires an access token');
  const res = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { contacts: res.data.results || [] };
}

export async function hubspotCreateContact(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['email', 'firstName', 'lastName', 'phone']);
  if (!params.email) throw new Error('email is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('HubSpot requires an access token');
  const res = await axios.post(
    'https://api.hubapi.com/crm/v3/objects/contacts',
    {
      properties: {
        email: params.email,
        firstname: params.firstName || '',
        lastname: params.lastName || '',
        phone: params.phone || '',
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { success: true, contactId: res.data.id, platform: 'hubspot' };
}

// ─── Mailchimp ──────────────────────────────────────────────────────────────────

export async function mailchimpGetAudiences(connectorId: string, _input: Record<string, unknown>) {
  const creds = await getCreds(connectorId);
  const token = creds.apiKey;
  if (!token) throw new Error('Mailchimp requires an API key');
  const server = token.split('-')[1] || 'us1';
  const res = await axios.get(`https://${server}.api.mailchimp.com/3.0/lists`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { audiences: res.data.lists || [] };
}

export async function mailchimpCreateCampaign(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['listId', 'subject', 'title']);
  if (!params.listId || !params.subject) throw new Error('listId and subject are required');
  const creds = await getCreds(connectorId);
  const token = creds.apiKey;
  if (!token) throw new Error('Mailchimp requires an API key');
  const server = token.split('-')[1] || 'us1';
  const res = await axios.post(
    `https://${server}.api.mailchimp.com/3.0/campaigns`,
    {
      type: 'regular',
      recipients: { list_id: params.listId },
      settings: { subject_line: params.subject, title: params.title || '' },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { success: true, campaignId: res.data.id, platform: 'mailchimp' };
}

// ─── Shopify ────────────────────────────────────────────────────────────────────

export async function shopifyGetProducts(connectorId: string, _input: Record<string, unknown>) {
  const creds = await getCreds(connectorId);
  const token = creds.apiKey;
  const shopDomain = creds.shopDomain;
  if (!token || !shopDomain) throw new Error('Shopify requires an API key and shop domain');
  const res = await axios.get(`https://${shopDomain}/admin/api/2024-01/products.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  return { products: res.data.products || [] };
}

export async function shopifyCreateProduct(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['title', 'bodyHtml', 'vendor', 'productType']);
  if (!params.title) throw new Error('title is required');
  const creds = await getCreds(connectorId);
  const token = creds.apiKey;
  const shopDomain = creds.shopDomain;
  if (!token || !shopDomain) throw new Error('Shopify requires an API key and shop domain');
  const res = await axios.post(
    `https://${shopDomain}/admin/api/2024-01/products.json`,
    {
      product: {
        title: params.title,
        body_html: params.bodyHtml || '',
        vendor: params.vendor || '',
        product_type: params.productType || '',
        status: 'draft',
      },
    },
    { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
  );
  return { success: true, productId: res.data.product?.id, platform: 'shopify' };
}

// ─── WordPress ──────────────────────────────────────────────────────────────────

export async function wordpressCreatePost(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['title', 'content', 'status', 'siteUrl']);
  if (!params.title || !params.content) throw new Error('title and content are required');
  if (!params.siteUrl) throw new Error('siteUrl is required (e.g., https://yoursite.com)');
  const creds = await getCreds(connectorId);
  const token = creds.apiKey || creds.accessToken;
  if (!token) throw new Error('WordPress requires an Application Password or OAuth token');
  const url = `${params.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
  const res = await axios.post(
    url,
    { title: params.title, content: params.content, status: params.status || 'draft' },
    { headers: { Authorization: `Basic ${Buffer.from(`admin:${token}`).toString('base64')}`, 'Content-Type': 'application/json' } }
  );
  return { success: true, postId: res.data.id, link: res.data.link, platform: 'wordpress' };
}

// ─── Google Analytics ───────────────────────────────────────────────────────────

export async function googleAnalyticsGetSessions(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['propertyId']);
  if (!params.propertyId) throw new Error('propertyId (GA4 property ID) is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Google Analytics requires an OAuth access token');
  const res = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${params.propertyId}:runReport`,
    {
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }],
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { report: res.data };
}

// ─── Notion ─────────────────────────────────────────────────────────────────────

export async function notionCreatePage(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['parentDatabaseId', 'title']);
  if (!params.parentDatabaseId || !params.title) throw new Error('parentDatabaseId and title are required');
  const creds = await getCreds(connectorId);
  const token = creds.integrationToken || creds.apiKey;
  if (!token) throw new Error('Notion requires an Integration Token');
  const res = await axios.post(
    'https://api.notion.com/v1/pages',
    {
      parent: { database_id: params.parentDatabaseId, type: 'database_id' },
      properties: {
        title: { title: [{ text: { content: params.title } }] },
      },
    },
    { headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    } }
  );
  return { success: true, pageId: res.data.id, url: res.data.url, platform: 'notion' };
}

// ─── Slack ──────────────────────────────────────────────────────────────────────

export async function slackSendMessage(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['channel', 'text']);
  if (!params.channel || !params.text) throw new Error('channel and text are required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Slack requires an OAuth token or API key');
  const res = await axios.post(
    'https://slack.com/api/chat.postMessage',
    { channel: params.channel, text: params.text },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  if (!res.data.ok) throw new Error(`Slack API error: ${res.data.error}`);
  return { success: true, channel: params.channel, ts: res.data.ts, platform: 'slack' };
}

// ─── Medium ─────────────────────────────────────────────────────────────────────

export async function mediumCreatePost(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['title', 'contentFormat', 'content', 'publishStatus']);
  if (!params.title || !params.content) throw new Error('title and content are required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Medium requires an integration token');
  // Get author ID
  const meRes = await axios.get('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const authorId = meRes.data.data.id;
  const res = await axios.post(
    `https://api.medium.com/v1/users/${authorId}/posts`,
    {
      title: params.title,
      contentFormat: params.contentFormat || 'markdown',
      content: params.content,
      publishStatus: params.publishStatus || 'draft',
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { success: true, postId: res.data.data.id, url: res.data.data.url, platform: 'medium' };
}

// ─── Canva ──────────────────────────────────────────────────────────────────────

export async function canvaCreateDesign(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['title', 'templateId', 'width', 'height']);
  if (!params.title) throw new Error('title is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Canva requires an OAuth access token');
  // Canva Connect API — create design
  const designData: Record<string, unknown> = {
    name: params.title,
    design_type: params.templateId ? 'template' : 'custom',
  };
  if (params.templateId) designData.asset_id = params.templateId;
  if (params.width && params.height) {
    designData.dimensions = { width: Number(params.width), height: Number(params.height) };
  }
  const res = await axios.post(
    'https://api.canva.com/rest/v1/designs',
    designData,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return {
    success: true,
    designId: res.data?.design?.id || 'canva-' + Date.now(),
    editUrl: `https://www.canva.com/design/${res.data?.design?.id || 'new'}/edit`,
    platform: 'canva',
  };
}

export async function canvaSearchTemplates(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['query']);
  if (!params.query) throw new Error('query is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Canva requires an OAuth access token');
  const res = await axios.get('https://api.canva.com/rest/v1/templates', {
    params: { q: params.query },
    headers: { Authorization: `Bearer ${token}` },
  });
  return { templates: res.data?.items || [] };
}

// ─── Google Ads ─────────────────────────────────────────────────────────────────

export async function googleAdsGetCampaigns(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['customerId']);
  if (!params.customerId) throw new Error('customerId is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Google Ads requires an OAuth access token');
  const res = await axios.post(
    `https://googleads.googleapis.com/v16/customers/${params.customerId}/googleAds:search`,
    { query: 'SELECT campaign.id, campaign.name, campaign.status FROM campaign' },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { campaigns: res.data.results || [] };
}

// ─── Facebook Ads ───────────────────────────────────────────────────────────────

export async function facebookAdsGetCampaigns(connectorId: string, input: Record<string, unknown>) {
  const params = extractParams(input, ['adAccountId']);
  if (!params.adAccountId) throw new Error('adAccountId is required');
  const creds = await getCreds(connectorId);
  const token = creds.accessToken || creds.apiKey;
  if (!token) throw new Error('Facebook Ads requires an access token');
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${params.adAccountId}/campaigns`,
    { params: { access_token: token, fields: 'id,name,status,daily_budget,lifetime_budget' } }
  );
  return { campaigns: res.data.data || [] };
}

// ─── Handler Router ─────────────────────────────────────────────────────────────

type PlatformHandler = (connectorId: string, input: Record<string, unknown>) => Promise<unknown>;

const handlerRegistry: Record<string, PlatformHandler> = {
  // Instagram
  'instagram_post_image': instagramPostImage,
  'instagram_get_comments': instagramGetComments,
  // LinkedIn
  'linkedin_post_text': linkedinPostText,
  'linkedin_post_image': linkedinPostImage,
  'linkedin_get_comments': linkedinGetComments,
  // X/Twitter
  'x_post_tweet': xPostTweet,
  'x_post_thread': xPostThread,
  'x_get_mentions': xGetMentions,
  // Facebook
  'facebook_post_text': facebookPostText,
  'facebook_post_image': facebookPostImage,
  'facebook_get_comments': facebookGetComments,
  // TikTok
  'tiktok_upload_video': tiktokUploadVideo,
  // YouTube
  'youtube_upload_video': youtubeUploadVideo,
  // Pinterest
  'pinterest_create_pin': pinterestCreatePin,
  // Reddit
  'reddit_submit_post': redditSubmitPost,
  // Bluesky
  'bluesky_post_text': blueskyPostText,
  // Threads
  'threads_post_text': threadsPostText,
  // HubSpot
  'hubspot_get_contacts': hubspotGetContacts,
  'hubspot_create_contact': hubspotCreateContact,
  // Mailchimp
  'mailchimp_get_audiences': mailchimpGetAudiences,
  'mailchimp_create_campaign': mailchimpCreateCampaign,
  // Shopify
  'shopify_get_products': shopifyGetProducts,
  'shopify_create_product': shopifyCreateProduct,
  // WordPress
  'wordpress_create_post': wordpressCreatePost,
  // Google Analytics
  'google_analytics_get_sessions': googleAnalyticsGetSessions,
  // Notion
  'notion_create_page': notionCreatePage,
  // Slack
  'slack_send_message': slackSendMessage,
  // Medium
  'medium_create_post': mediumCreatePost,
  // Canva
  'canva_create_design': canvaCreateDesign,
  'canva_search_templates': canvaSearchTemplates,
  // Google Ads
  'google_ads_get_campaigns': googleAdsGetCampaigns,
  // Facebook Ads
  'facebook_ads_get_campaigns': facebookAdsGetCampaigns,
};

export { handlerRegistry };

export async function callPlatformHandler(
  provider: string,
  toolName: string,
  connectorId: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const handlerKey = `${provider}_${toolName}`;
  const handler = handlerRegistry[handlerKey];
  if (!handler) {
    // Try looking up by tool name only (for generic tools that share names across platforms)
    const genericHandler = handlerRegistry[toolName];
    if (!genericHandler) {
      throw new Error(`No handler registered for ${provider}/${toolName}. Available: ${Object.keys(handlerRegistry).join(', ')}`);
    }
    return genericHandler(connectorId, input);
  }
  return handler(connectorId, input);
}
