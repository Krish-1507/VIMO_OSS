/**
 * Research channels — VIMO's internal AgentReach-style reading layer.
 *
 * Each channel (web, reddit, youtube, github, rss, x-post) is tested with
 * stubbed fetch: realistic payloads in, clean LLM-ready text out, honest
 * errors on auth walls and missing data. No network anywhere in this file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractArticleText,
  extractVideoId,
  searchReddit,
  readRedditThread,
  readYouTubeTranscript,
  searchGitHubRepos,
  readGitHubReadme,
  readRssFeed,
  readXPost,
} from '../services/researchChannels';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => handler(url)),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html' } });
}

describe('extractArticleText', () => {
  it('strips chrome and keeps real content', () => {
    const html =
      '<html><head><style>.x{color:red}</style></head><body><nav>links</nav>' +
      '<h1>Why sourdough wins</h1><p>Fermentation creates flavor compounds over a long slow rise that commercial yeast cannot match in a hurry.</p>' +
      '<script>track()</script></body></html>';
    const text = extractArticleText(html);
    expect(text).toContain('Why sourdough wins');
    expect(text).toContain('Fermentation');
    expect(text).not.toContain('track()');
    expect(text).not.toContain('links');
  });
});

describe('reddit channel', () => {
  it('searches and normalizes posts', async () => {
    stubFetch(() =>
      jsonResponse({
        data: {
          children: [
            {
              data: {
                title: 'Best espresso under $500?',
                subreddit: 'coffee',
                permalink: '/r/coffee/comments/abc/best/',
                score: 214,
                num_comments: 96,
                selftext: 'Looking for a first machine with real temperature control.',
              },
            },
          ],
        },
      }),
    );
    const posts = await searchReddit('espresso machine', 'coffee', 5);
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toContain('espresso');
    expect(posts[0].url).toContain('/r/coffee/');
    expect(posts[0].comments).toBe(96);
  });

  it('reads threads with top comments', async () => {
    stubFetch(() =>
      jsonResponse([
        { data: { children: [{ data: { title: 'Thread', selftext: 'Body text here' } }] } },
        {
          data: {
            children: [
              { data: { body: 'This is a genuinely useful long comment about the topic.' } },
              { data: { body: 'ok' } },
            ],
          },
        },
      ]),
    );
    const thread = await readRedditThread('/r/coffee/comments/abc/best/');
    expect(thread.title).toBe('Thread');
    expect(thread.comments).toHaveLength(1);
  });
});

describe('youtube channel', () => {
  it('extracts video ids from urls', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('not a url')).toBeNull();
  });

  it('reads transcripts from caption tracks', async () => {
    stubFetch((url: string) => {
      if (url.includes('/watch?')) {
        return htmlResponse(
          '<html><head><title>Latte Art Basics - YouTube</title></head><body>' +
            '{"captionTracks":[{"baseUrl":"https://example.com/caps?x=1","languageCode":"en"}]}</body></html>',
        );
      }
      return new Response(
        '<transcript><text start="0">pour low and slow</text><text start="2">then lift for contrast</text></transcript>',
        { status: 200, headers: { 'Content-Type': 'application/xml' } },
      );
    });
    const t = await readYouTubeTranscript('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(t.title).toContain('Latte Art');
    expect(t.transcript).toContain('pour low and slow');
    expect(t.language).toBe('en');
  });

  it('says plainly when captions are missing', async () => {
    stubFetch(() => htmlResponse('<html><head><title>No caps</title></head><body>hi</body></html>'));
    await expect(readYouTubeTranscript('dQw4w9WgXcQ')).rejects.toThrow(/no public captions/i);
  });
});

describe('github channel', () => {
  it('searches repos and reads readmes', async () => {
    stubFetch((url: string) => {
      if (url.includes('/search/repositories')) {
        return jsonResponse({
          items: [{ full_name: 'acme/widgets', description: 'Widgets', stargazers_count: 1200, html_url: 'https://github.com/acme/widgets' }],
        });
      }
      return new Response('# Widgets\nDoes things well.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    });
    const repos = await searchGitHubRepos('widgets', 3);
    expect(repos[0].fullName).toBe('acme/widgets');
    expect(repos[0].stars).toBe(1200);
    const readme = await readGitHubReadme('acme/widgets');
    expect(readme.readme).toContain('Does things well');
  });
});

describe('rss channel', () => {
  it('parses RSS feeds', async () => {
    stubFetch(() =>
      new Response(
        '<?xml version="1.0"?><rss><channel>' +
          '<item><title>Launch day</title><link>https://example.com/1</link>' +
          '<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>' +
          '<description><p>We shipped <b>big</b> things.</p></description></item>' +
          '</channel></rss>',
        { status: 200, headers: { 'Content-Type': 'application/rss+xml' } },
      ),
    );
    const items = await readRssFeed('https://example.com/feed', 5);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Launch day');
    expect(items[0].snippet).toContain('We shipped big things');
  });
});

describe('x-post channel', () => {
  it('reads single posts without auth', async () => {
    stubFetch(() =>
      jsonResponse({ author_name: 'Acme', html: '<p>Shipping <a href="#">v2</a> today</p>', url: 'https://x.com/x/1' }),
    );
    const post = await readXPost('https://x.com/X/status/1507774801372332032');
    expect(post.author).toBe('Acme');
    expect(post.text).toContain('Shipping v2 today');
  });

  it('explains login-walled posts honestly', async () => {
    stubFetch(() => new Response('nope', { status: 401 }));
    await expect(readXPost('https://x.com/X/status/1')).rejects.toThrow(/login/i);
  });
});
