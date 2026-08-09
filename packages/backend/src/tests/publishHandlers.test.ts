/**
 * WordPress + Slack publish handlers in vimoSocialPublishService.
 *
 * WordPress authenticates with an application password via the WP REST API;
 * Slack with a bot token via chat.postMessage. Only the external HTTP calls
 * are mocked — the connector lookup, credential reads, and error mapping run
 * against the real service and the real in-memory database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { vimoSocialPublish } from '../services/vimoSocialPublishService';
import { db } from '../db';
import { connectors } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as credentialStore from '../lib/credentialStore';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

const mockedAxios = vi.mocked(axios);

async function seedConnector(id: string, provider: string, config: Record<string, unknown>): Promise<void> {
  db.delete(connectors).where(eq(connectors.id, id)).run();
  db.insert(connectors)
    .values({
      id,
      name: provider,
      type: provider === 'slack' ? 'productivity' : 'social',
      provider,
      status: 'active',
      configJson: JSON.stringify(config),
      encryptedCredentials: JSON.stringify({}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
}

afterEach(() => {
  db.delete(connectors).run();
});

describe('WordPress publish', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
  });

  it('fails with a friendly error when the application password is missing', async () => {
    await seedConnector('wp-1', 'wordpress', { siteUrl: 'https://example.com', username: 'admin' });
    await credentialStore.deleteCredential('wp-1');

    const res = await vimoSocialPublish.publish({
      postId: 'p1',
      content: 'Hello WordPress',
      platforms: ['wordpress'],
    });

    expect(res.success).toBe(false);
    expect(res.platformResults.wordpress.error).toMatch(/application password/i);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('fails with a friendly error when site URL or username is missing', async () => {
    await seedConnector('wp-2', 'wordpress', {});
    await credentialStore.storeCredential('wp-2', 'apiKey', 'xxxx xxxx xxxx xxxx');

    const res = await vimoSocialPublish.publish({
      postId: 'p2',
      content: 'Hello WordPress',
      platforms: ['wordpress'],
    });

    expect(res.success).toBe(false);
    expect(res.platformResults.wordpress.error).toMatch(/site URL/i);
  });

  it('creates a draft post via the WP REST API with Basic auth', async () => {
    await seedConnector('wp-3', 'wordpress', { siteUrl: 'https://example.com', username: 'admin' });
    await credentialStore.storeCredential('wp-3', 'apiKey', 'app-pass-1');
    mockedAxios.post.mockResolvedValue({ data: { id: 42 } });

    const res = await vimoSocialPublish.publish({
      postId: 'p3',
      content: 'First line\nRest of the post.',
      platforms: ['wordpress'],
    });

    expect(res.success).toBe(true);
    expect(res.platformResults.wordpress.platformPostId).toBe('42');

    const [url, body, opts] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/posts');
    expect(body).toMatchObject({
      title: 'First line',
      content: 'First line\nRest of the post.',
      status: 'draft',
    });
    const expectedAuth = `Basic ${Buffer.from('admin:app-pass-1').toString('base64')}`;
    expect(opts?.headers?.Authorization).toBe(expectedAuth);
  });

  it('publishes directly when metadata.status is publish', async () => {
    await seedConnector('wp-4', 'wordpress', { siteUrl: 'https://example.com', username: 'admin' });
    await credentialStore.storeCredential('wp-4', 'apiKey', 'app-pass-2');
    mockedAxios.post.mockResolvedValue({ data: { id: 7 } });

    const res = await vimoSocialPublish.publish({
      postId: 'p4',
      content: 'Go live',
      platforms: ['wordpress'],
      metadata: { status: 'publish' },
    });

    expect(res.success).toBe(true);
    const body = mockedAxios.post.mock.calls[0][1];
    expect((body as any).status).toBe('publish');
  });

  it('surfaces the WordPress API error message', async () => {
    await seedConnector('wp-5', 'wordpress', { siteUrl: 'https://example.com', username: 'admin' });
    await credentialStore.storeCredential('wp-5', 'apiKey', 'app-pass-3');
    mockedAxios.post.mockRejectedValue({
      response: { data: { message: 'Sorry, you are not allowed to create posts as this user.' } },
    });

    const res = await vimoSocialPublish.publish({
      postId: 'p5',
      content: 'Hello',
      platforms: ['wordpress'],
    });

    expect(res.success).toBe(false);
    expect(res.platformResults.wordpress.error).toContain('not allowed to create posts');
  });
});

describe('Slack publish', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
  });

  it('fails with a friendly error when the bot token is missing', async () => {
    await seedConnector('slack-1', 'slack', {});

    const res = await vimoSocialPublish.publish({
      postId: 'p6',
      content: 'Hello team',
      platforms: ['slack'],
    });

    expect(res.success).toBe(false);
    expect(res.platformResults.slack.error).toMatch(/reconnect/i);
  });

  it('posts to the channel from metadata and returns the message timestamp', async () => {
    await seedConnector('slack-2', 'slack', {});
    await credentialStore.storeCredential('slack-2', 'accessToken', 'xoxb-token');
    mockedAxios.post.mockResolvedValue({ data: { ok: true, ts: '1710000000.000200' } });

    const res = await vimoSocialPublish.publish({
      postId: 'p7',
      content: 'Launch day!',
      platforms: ['slack'],
      metadata: { channel: '#marketing' },
    });

    expect(res.success).toBe(true);
    expect(res.platformResults.slack.platformPostId).toBe('1710000000.000200');

    const [url, body, opts] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(body).toMatchObject({ channel: '#marketing', text: 'Launch day!' });
    expect(opts?.headers?.Authorization).toBe('Bearer xoxb-token');
  });

  it('defaults to the general channel when none is given', async () => {
    await seedConnector('slack-3', 'slack', {});
    await credentialStore.storeCredential('slack-3', 'accessToken', 'xoxb-token');
    mockedAxios.post.mockResolvedValue({ data: { ok: true, ts: '1.2' } });

    await vimoSocialPublish.publish({ postId: 'p8', content: 'Hi', platforms: ['slack'] });

    const body = mockedAxios.post.mock.calls[0][1];
    expect((body as any).channel).toBe('#general');
  });

  it('surfaces Slack API errors (ok: false)', async () => {
    await seedConnector('slack-4', 'slack', {});
    await credentialStore.storeCredential('slack-4', 'accessToken', 'xoxb-token');
    mockedAxios.post.mockResolvedValue({ data: { ok: false, error: 'channel_not_found' } });

    const res = await vimoSocialPublish.publish({
      postId: 'p9',
      content: 'Hi',
      platforms: ['slack'],
    });

    expect(res.success).toBe(false);
    expect(res.platformResults.slack.error).toContain('channel_not_found');
  });
});
