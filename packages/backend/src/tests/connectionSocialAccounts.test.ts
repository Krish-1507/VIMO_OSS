/**
 * Connection-layer integration tests — Social Accounts (Instagram).
 *
 * Strategy: the *external* API (Facebook Graph) is fully mocked with axios,
 * but every piece of VIMO's own logic stays real:
 *   - account-type detection (verifyAccountType)
 *   - media-container creation + publish polling (publishMediaContainer)
 *   - error mapping (token expiry, personal accounts, missing credentials)
 *
 * This proves the connect → publish pipeline works end-to-end without ever
 * hitting a real Meta server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The Instagram handler imports `io` from the server entrypoint. Mocking the
// entrypoint stops the app from booting when the handler module loads.
vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

// Mock the external API boundary only. `axios.create` returns the same shared
// fake instance so the handler's direct axios.get/post calls are intercepted.
const { http } = vi.hoisted(() => {
  const http = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    create: vi.fn(),
  };
  http.create.mockReturnValue(http);
  return { http };
});
vi.mock('axios', () => ({ default: http, ...http }));

import axios from 'axios';
import {
  verifyAccountType,
  publishPost,
  type ScheduledPostForHandler,
} from '../connectors/handlers/instagramHandler';

const IG_ACCOUNT_ID = '17841400000000000';

function resetHttp() {
  (axios.get as any).mockReset();
  (axios.post as any).mockReset();
  (axios.delete as any).mockReset();
  (axios.request as any).mockReset();
}

function mockGraphGetRoutes(routes: Array<[string, unknown]>) {
  (axios.get as any).mockImplementation(async (url: string) => {
    for (const [substr, data] of routes) {
      if (url.includes(substr)) return { data };
    }
    throw new Error(`Unexpected GET to ${url}`);
  });
}

function mockGraphPostRoutes(routes: Array<[string, unknown]>) {
  (axios.post as any).mockImplementation(async (url: string) => {
    for (const [substr, data] of routes) {
      if (url.includes(substr)) return { data };
    }
    throw new Error(`Unexpected POST to ${url}`);
  });
}

const samplePost: ScheduledPostForHandler = {
  id: 'post_1',
  brandProfileId: 'brand_1',
  content: 'Hello from VIMO! 🚀',
  platform: 'instagram',
  mediaUrls: ['https://example.com/image.jpg'],
  scheduledAt: '',
  metadata: {},
};

describe('Social Accounts — connect (Instagram account verification)', () => {
  beforeEach(resetHttp);

  it('detects a Business account and reads its profile', async () => {
    mockGraphGetRoutes([
      ['/me/accounts', { data: [{ id: 'PAGE_1' }] }],
      ['PAGE_1', { instagram_business_account: { id: IG_ACCOUNT_ID } }],
      [IG_ACCOUNT_ID, { account_type: 'business', username: 'testbrand', followers_count: 1200, media_count: 42 }],
    ]);

    const res = await verifyAccountType('IG_ACCESS_TOKEN');
    expect(res.accountType).toBe('business');
    expect(res.username).toBe('testbrand');
    expect(res.followersCount).toBe(1200);
    expect(res.instagramAccountId).toBe(IG_ACCOUNT_ID);
  });

  it('falls back to a personal account when no business IG is linked', async () => {
    mockGraphGetRoutes([['/me/accounts', { data: [] }]]);

    const res = await verifyAccountType('IG_ACCESS_TOKEN');
    expect(res.accountType).toBe('personal');
    expect(res.instagramAccountId).toBe('');
  });
});

describe('Social Accounts — publish (Instagram)', () => {
  beforeEach(resetHttp);

  it('creates a media container, publishes, and returns the post id + permalink', async () => {
    mockGraphGetRoutes([
      ['/me/accounts', { data: [{ id: 'PAGE_1' }] }],
      ['PAGE_1', { instagram_business_account: { id: IG_ACCOUNT_ID } }],
      [IG_ACCOUNT_ID, { account_type: 'business', username: 'testbrand', followers_count: 1200, media_count: 42 }],
      ['CONTAINER_1', { status_code: 'FINISHED' }],
      ['POST_123', { permalink: 'https://instagram.com/p/abc' }],
    ]);
    mockGraphPostRoutes([
      ['media_publish', { id: 'POST_123' }],
      [`${IG_ACCOUNT_ID}/media`, { id: 'CONTAINER_1' }],
    ]);

    const result = await publishPost(samplePost, {
      accessToken: 'IG_ACCESS_TOKEN',
      instagramAccountId: IG_ACCOUNT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.platformPostId).toBe('POST_123');
    expect(result.permalink).toBe('https://instagram.com/p/abc');
  });

  it('refuses to publish from a personal account', async () => {
    mockGraphGetRoutes([['/me/accounts', { data: [] }]]);

    const result = await publishPost(samplePost, {
      accessToken: 'IG_ACCESS_TOKEN',
      instagramAccountId: IG_ACCOUNT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Business or Creator account/i);
  });

  it('fails fast when the access token is missing', async () => {
    const result = await publishPost(samplePost, {
      instagramAccountId: IG_ACCOUNT_ID,
    } as Record<string, string>);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/access token/i);
  });

  it('maps an expired-token error (Graph code 190) to a reconnect message', async () => {
    mockGraphGetRoutes([
      ['/me/accounts', { data: [{ id: 'PAGE_1' }] }],
      ['PAGE_1', { instagram_business_account: { id: IG_ACCOUNT_ID } }],
      [IG_ACCOUNT_ID, { account_type: 'business', username: 'x', followers_count: 1, media_count: 1 }],
    ]);

    const expired = Object.assign(new Error('Unauthorized'), {
      response: { data: { error: { code: 190, message: 'Token expired' } } },
    });
    (axios.post as any).mockImplementation(async (url: string) => {
      if (url.includes(`${IG_ACCOUNT_ID}/media`)) throw expired;
      throw new Error(`Unexpected POST to ${url}`);
    });

    const result = await publishPost(samplePost, {
      accessToken: 'IG_ACCESS_TOKEN',
      instagramAccountId: IG_ACCOUNT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/reconnect/i);
  });
});
