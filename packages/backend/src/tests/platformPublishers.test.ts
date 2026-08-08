/**
 * Platform Publishers — YouTube / TikTok / Pinterest
 *
 * These are the real publish handlers that replaced the "connect-only"
 * stubs. We mock axios and assert the exact request payloads VIMO sends to
 * each platform's API, plus the plain-English error mapping (no OAuth/token
 * details ever leak to the UI).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

import {
  publishToYouTube,
  publishToTikTok,
  publishToPinterest,
} from '../services/platformPublishers';

const ACCESS_TOKEN = 'test-access-token-123';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: {
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
    },
  };
});

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockedAxios.post.mockReset();
  mockedAxios.get.mockReset();
  mockedAxios.put.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('publishToYouTube', () => {
  it('creates a resumable upload session then uploads the video bytes', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      headers: { location: 'https://youtube.com/resumable/upload-abc' },
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: Buffer.from('video-bytes'),
      headers: { 'content-type': 'video/mp4' },
    });
    mockedAxios.put.mockResolvedValueOnce({ data: { id: 'video-123' } });

    const result = await publishToYouTube({
      accessToken: ACCESS_TOKEN,
      content: 'Check out our new launch!\n\n#launch',
      mediaUrls: ['https://cdn.example.com/video.mp4'],
    });

    expect(result).toEqual({ success: true, platformPostId: 'video-123' });

    const initCall = mockedAxios.post.mock.calls[0];
    expect(initCall[0]).toBe(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'
    );
    expect(initCall[1]).toMatchObject({
      snippet: {
        title: 'Check out our new launch!',
        description: 'Check out our new launch!\n\n#launch',
      },
      status: { privacyStatus: 'public' },
    });
    expect(initCall[2].headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    expect(mockedAxios.get).toHaveBeenCalledWith('https://cdn.example.com/video.mp4', {
      responseType: 'arraybuffer',
    });
    expect(mockedAxios.put).toHaveBeenCalledWith(
      'https://youtube.com/resumable/upload-abc',
      expect.anything(),
      { headers: { 'Content-Type': 'video/mp4' } }
    );
  });

  it('returns a friendly error when no video is attached', async () => {
    const result = await publishToYouTube({
      accessToken: ACCESS_TOKEN,
      content: 'Text only',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('video');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('maps auth failures to a reconnect message', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Invalid Credentials' } },
    });
    const result = await publishToYouTube({
      accessToken: ACCESS_TOKEN,
      content: 'Video post',
      mediaUrls: ['https://cdn.example.com/video.mp4'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('reconnect');
    expect(result.error).not.toContain('401');
  });
});

describe('publishToTikTok', () => {
  it('initializes a PULL_FROM_URL post and polls until PUBLISH_COMPLETE', async () => {
    vi.useFakeTimers();
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { publish_id: 'publish-1' } } });
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { status: 'PROCESSING_UPLOAD' } } });
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { status: 'PUBLISH_COMPLETE' } } });

    const resultPromise = publishToTikTok({
      accessToken: ACCESS_TOKEN,
      content: 'TikTok hook line',
      mediaUrls: ['https://cdn.example.com/clip.mp4'],
    });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    const result = await resultPromise;

    expect(result).toEqual({ success: true, platformPostId: 'publish-1' });

    const initCall = mockedAxios.post.mock.calls[0];
    expect(initCall[0]).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/');
    expect(initCall[1]).toMatchObject({
      post_info: { title: 'TikTok hook line', privacy_level: 'SELF_ONLY' },
      source_info: { source: 'PULL_FROM_URL', video_url: 'https://cdn.example.com/clip.mp4' },
    });
    expect(initCall[2].headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    const statusCall = mockedAxios.post.mock.calls[2];
    expect(statusCall[0]).toBe('https://open.tiktokapis.com/v2/post/publish/status/fetch/');
    expect(statusCall[1]).toEqual({ get_post_info: { publish_id: 'publish-1' } });
  });

  it('reports failure when TikTok rejects the post', async () => {
    vi.useFakeTimers();
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { publish_id: 'publish-2' } } });
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { status: 'FAILED' } } });
    const resultPromise = publishToTikTok({
      accessToken: ACCESS_TOKEN,
      content: 'A clip',
      mediaUrls: ['https://cdn.example.com/clip.mp4'],
    });
    await vi.advanceTimersByTimeAsync(5 * 1000);
    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('TikTok');
  });

  it('returns a friendly error when no video is attached', async () => {
    const result = await publishToTikTok({
      accessToken: ACCESS_TOKEN,
      content: 'No media',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('video');
  });
});

describe('publishToPinterest', () => {
  it('resolves the first board then creates a pin with an image_url source', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { items: [{ id: 'board-1', name: 'Products' }] },
    });
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'pin-42' } });

    const result = await publishToPinterest({
      accessToken: ACCESS_TOKEN,
      content: 'New product drop!\n\n#shop',
      mediaUrls: ['https://cdn.example.com/img.jpg'],
    });

    expect(result).toEqual({ success: true, platformPostId: 'pin-42' });

    expect(mockedAxios.get).toHaveBeenCalledWith('https://api.pinterest.com/v5/boards', {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    const pinCall = mockedAxios.post.mock.calls[0];
    expect(pinCall[0]).toBe('https://api.pinterest.com/v5/pins');
    expect(pinCall[1]).toMatchObject({
      title: 'New product drop!',
      description: 'New product drop!\n\n#shop',
      board_id: 'board-1',
      media_source: { source_type: 'image_url', url: 'https://cdn.example.com/img.jpg' },
    });
    expect(pinCall[2].headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('uses the requested boardId when provided', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'pin-7' } });
    const result = await publishToPinterest({
      accessToken: ACCESS_TOKEN,
      content: 'Pin it',
      mediaUrls: ['https://cdn.example.com/img.jpg'],
      metadata: { boardId: 'board-custom' },
    });
    expect(result).toEqual({ success: true, platformPostId: 'pin-7' });
    expect(mockedAxios.post.mock.calls[0][1].board_id).toBe('board-custom');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('returns a friendly error when no image is attached', async () => {
    const result = await publishToPinterest({
      accessToken: ACCESS_TOKEN,
      content: 'No image',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('image');
  });
});
