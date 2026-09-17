/**
 * Website crawler — the analyze-website feature lives or dies here.
 *
 * Users paste bare domains and bot-guarded sites; the crawler must try URL
 * variants, speak with a browser User-Agent, and fail with TYPED reasons
 * (blocked / not_found / timeout / unreachable / bad_url) so the UI can
 * offer the right next step instead of a dead-end "check the URL".
 * Global fetch is stubbed — no network anywhere in this file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { candidateUrls, crawlWebsite, CrawlError } from '../services/websiteCrawler';

const MIN_HTML =
  '<html><head><title>Acme Bakery</title>' +
  '<meta name="description" content="Fresh sourdough in Portland."></head>' +
  '<body><h1>Fresh sourdough daily</h1><p>We bake organic loaves every morning.</p></body></html>';

function stubFetch(handler: (url: string) => Response | Promise<Response> | never): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => handler(url)),
  );
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('candidateUrls', () => {
  it('tries https, http, and www variants for a bare domain', () => {
    expect(candidateUrls('example.com')).toEqual([
      'https://example.com/',
      'http://example.com/',
      'https://www.example.com/',
    ]);
  });

  it('dedupes when www is already present', () => {
    const urls = candidateUrls('https://www.example.com');
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls[0]).toBe('https://www.example.com/');
  });

  it('rejects garbage input as bad_url', () => {
    expect(() => candidateUrls('not a website!!!')).toThrowError(CrawlError);
    try {
      candidateUrls('not a website!!!');
    } catch (err) {
      expect((err as CrawlError).reason).toBe('bad_url');
    }
  });
});

describe('fetch failure reasons', () => {
  it('reports blocked on 403 instead of a generic failure', async () => {
    stubFetch(() => new Response('denied', { status: 403 }));
    await expect(crawlWebsite('https://example.com')).rejects.toMatchObject({ reason: 'blocked' });
  });

  it('reports not_found on 404', async () => {
    stubFetch(() => new Response('missing', { status: 404 }));
    await expect(crawlWebsite('https://example.com/nothing')).rejects.toMatchObject({
      reason: 'not_found',
    });
  });

  it('falls through to the next variant when one is unreachable', async () => {
    stubFetch((url: string) => {
      if (url.startsWith('https://example.com/')) throw new TypeError('fetch failed');
      return htmlResponse(MIN_HTML);
    });
    const result = await crawlWebsite('example.com');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Acme Bakery');
    expect(result?.rootUrl.startsWith('http://example.com')).toBe(true);
  });

  it('returns a full analysis on success', async () => {
    stubFetch(() => htmlResponse(MIN_HTML));
    const result = await crawlWebsite('https://example.com');
    expect(result?.title).toBe('Acme Bakery');
    expect(result?.description).toContain('sourdough');
    expect(result?.pagesCrawled).toBe(1);
  });
});
