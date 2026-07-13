import { FastifyInstance } from 'fastify';
import { 
  InstagramClient, 
  FacebookClient, 
  LinkedInClient, 
  XClient,
  TikTokClient,
  YouTubeClient,
  PinterestClient,
  BlueskyClient,
  ThreadsClient,
  RedditClient,
  MediumClient,
  getAllPlatformHealth,
  getAllPlatformMetrics 
} from '../services/platformClients';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { db } from '../db';
import * as credentialStore from '../lib/credentialStore';

const router = (app: FastifyInstance) => {
  const registry = new ConnectorRegistry(db);

  // Initialize platform clients
  const clients = {
    instagram: new InstagramClient(),
    facebook: new FacebookClient(),
    linkedin: new LinkedInClient(),
    x: new XClient(),
    tiktok: new TikTokClient(),
    youtube: new YouTubeClient(),
    pinterest: new PinterestClient(),
    bluesky: new BlueskyClient(),
    threads: new ThreadsClient(),
    reddit: new RedditClient(),
    medium: new MediumClient(),
  };

  // Health check endpoint for all platforms
  app.get('/api/social-platforms/health', async () => {
    const health = await getAllPlatformHealth();
    return health;
  });

  // Metrics endpoint for all platforms
  app.get('/api/social-platforms/metrics', async () => {
    const metrics = await getAllPlatformMetrics();
    return metrics;
  });

  // Platform-specific routes
  app.get('/api/social-platforms/instagram/account/:id', async (request) => {
    const { id } = request.params as { id: string };
    const account = await clients.instagram.getAccountInfo(id);
    return account;
  });

  app.post('/api/social-platforms/instagram/publish', async (request) => {
    const { accountId, imageUrl, caption } = request.body as { accountId: string; imageUrl: string; caption: string };
    const postId = await clients.instagram.publishMedia(accountId, imageUrl, caption);
    return { postId };
  });

  app.get('/api/social-platforms/facebook/page', async () => {
    const page = await clients.facebook.getPageInfo();
    return page;
  });

  app.post('/api/social-platforms/facebook/post', async (request) => {
    const { pageId, content, mediaUrl } = request.body as { pageId: string; content: string; mediaUrl?: string };
    const postId = await clients.facebook.publishPost(pageId, content, mediaUrl);
    return { postId };
  });

  app.get('/api/social-platforms/linkedin/profile', async () => {
    const profile = await clients.linkedin.getProfileInfo();
    return profile;
  });

  app.post('/api/social-platforms/linkedin/post', async (request) => {
    const { content, mediaUrl } = request.body as { content: string; mediaUrl?: string };
    const postId = await clients.linkedin.publishPost(content, mediaUrl);
    return { postId };
  });

  app.post('/api/social-platforms/x/tweet', async (request) => {
    const { text } = request.body as { text: string };
    const tweet = await clients.x.publishTweet(text);
    return tweet;
  });

  app.get('/api/social-platforms/x/me', async () => {
    const me = await clients.x.getMe();
    return me;
  });

  app.get('/api/social-platforms/tiktok/user', async () => {
    const user = await clients.tiktok.getUserInfo();
    return user;
  });

  app.get('/api/social-platforms/youtube/channel', async () => {
    const channel = await clients.youtube.getMyChannel();
    return channel;
  });

  app.get('/api/social-platforms/pinterest/user', async () => {
    const user = await clients.pinterest.getUserInfo();
    return user;
  });

  app.post('/api/social-platforms/bluesky/post', async (request) => {
    const { text } = request.body as { text: string };
    const post = await clients.bluesky.publishPost(text);
    return post;
  });
};

export default router;
