/**
 * Research Channels — VIMO's internal AgentReach-style reading layer.
 *
 * One module per platform, each with the same shape: `check()` (is this
 * channel usable right now — the `doctor` primitive) plus read/search
 * functions that return clean, LLM-ready text. Zero API keys, zero extra
 * processes, zero Python: plain fetch + parsing on VIMO's own stack.
 *
 * Honest limits (stated, not hidden):
 * - X/Twitter needs a logged-in session: single posts read fine
 *   unauthenticated (oEmbed), but search/timelines need the user's cookies
 *   (stored encrypted per connector when provided).
 * - YouTube transcripts need public captions on the video.
 * - Reddit public reads work keyless; aggressive datacenter IPs can be
 *   rate-limited (failures come back as clean errors, never hangs).
 */
import { XMLParser } from 'fast-xml-parser';
import { db } from '../db';
import { connectors } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as credentialStore from '../lib/credentialStore';
import { createLogger } from '../lib/logger';

const log = createLogger('research');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchText(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
  return await res.text();
}

/** Readability-lite: strip chrome, keep headings/paragraphs/lists. */
export function extractArticleText(html: string, maxChars = 6000): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const blocks: string[] = [];
  const re = /<(h[1-3]|p|li|blockquote|td)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutNoise)) !== null) {
    const isHeading = /^h[1-3]$/i.test(m[1]);
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    // Headings are high-signal even when short; body blocks need substance.
    if (text.length > 2 && (isHeading || text.length > 40)) blocks.push(text);
    if (blocks.join(' ').length > maxChars) break;
  }
  if (blocks.length === 0) {
    const fallback = withoutNoise.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return fallback.slice(0, maxChars);
  }
  return blocks.join('\n\n').slice(0, maxChars);
}

/** Deep-text: XML nodes with nested markup stringify to [object Object]. */
export function xmlNodeText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(xmlNodeText).join(' ');
  if (typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, v]) => xmlNodeText(v))
      .join(' ');
  }
  return '';
}

export interface ChannelStatus {
  channel: string;
  available: boolean;
  detail: string;
}

export interface RedditPost {
  title: string;
  subreddit: string;
  url: string;
  score: number;
  comments: number;
  selftext: string;
}

export interface YouTubeTranscript {
  videoId: string;
  title: string;
  transcript: string;
  language: string;
}

export interface GitHubRepo {
  fullName: string;
  description: string;
  stars: number;
  url: string;
  readme?: string;
}

export interface RssItem {
  title: string;
  link: string;
  published: string;
  snippet: string;
}

/* ------------------------------------------------------------------ */
/*  Web: clean article extraction                                       */
/* ------------------------------------------------------------------ */

export async function readWebPage(url: string): Promise<{ title: string; text: string }> {
  const html = await fetchText(url, 12000);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  return { title, text: extractArticleText(html) };
}

/* ------------------------------------------------------------------ */
/*  Reddit: search + thread read (public JSON, keyless)                 */
/* ------------------------------------------------------------------ */

export async function searchReddit(query: string, subreddit?: string, limit = 8): Promise<RedditPost[]> {
  const scope = subreddit ? `/r/${subreddit.replace(/^r\//, '')}` : '';
  const url =
    `https://www.reddit.com${scope}/search.json?q=${encodeURIComponent(query)}` +
    `&restrict_sr=${subreddit ? 'true' : 'false'}&sort=relevance&limit=${Math.min(limit, 25)}`;
  const raw = await fetchText(url, 12000, { Accept: 'application/json' });
  const data = JSON.parse(raw) as any;
  const children = data?.data?.children || [];
  return children.slice(0, limit).map((c: any) => ({
    title: c.data?.title || '(untitled)',
    subreddit: c.data?.subreddit || '',
    url: `https://www.reddit.com${c.data?.permalink || ''}`,
    score: c.data?.score ?? 0,
    comments: c.data?.num_comments ?? 0,
    selftext: String(c.data?.selftext || '').slice(0, 2000),
  }));
}

export async function readRedditThread(urlOrPermalink: string, maxComments = 10): Promise<{ title: string; body: string; comments: string[] }> {
  const permalink = urlOrPermalink.includes('reddit.com')
    ? new URL(urlOrPermalink).pathname.replace(/\/$/, '')
    : urlOrPermalink.startsWith('/r/')
      ? urlOrPermalink
      : `/r/all/comments/${urlOrPermalink}`;
  const raw = await fetchText(`https://www.reddit.com${permalink}.json`, 12000, {
    Accept: 'application/json',
  });
  const data = JSON.parse(raw);
  const post = data?.[0]?.data?.children?.[0]?.data || {};
  const comments = (data?.[1]?.data?.children || [])
    .map((c: any) => c?.data?.body)
    .filter((b: string) => typeof b === 'string' && b.length > 20)
    .slice(0, maxComments);
  return {
    title: post.title || '',
    body: String(post.selftext || '').slice(0, 3000),
    comments,
  };
}

/* ------------------------------------------------------------------ */
/*  YouTube: transcripts (public captions, keyless)                     */
/* ------------------------------------------------------------------ */

export function extractVideoId(input: string): string | null {
  const m = input.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function readYouTubeTranscript(videoUrlOrId: string): Promise<YouTubeTranscript> {
  const videoId = extractVideoId(videoUrlOrId) || videoUrlOrId.trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('That does not look like a YouTube video link or id.');
  }
  const watchHtml = await fetchText(`https://www.youtube.com/watch?v=${videoId}`, 12000);
  const title = (watchHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/\s+/g, ' ')
    .replace(/ - YouTube$/, '')
    .trim();
  const tracksMatch = watchHtml.match(/"captionTracks":(\[.*?\])/);
  if (!tracksMatch) {
    throw new Error('This video has no public captions to read (private, unlisted, or captions off).');
  }
  let tracks: Array<{ baseUrl?: string; languageCode?: string }> = [];
  try {
    tracks = JSON.parse(tracksMatch[1]);
  } catch {
    throw new Error('Could not parse this video\u2019s caption list.');
  }
  const track =
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => (t.languageCode || '').startsWith('en')) ||
    tracks[0];
  if (!track?.baseUrl) throw new Error('No readable caption track found.');
  const xml = await fetchText(track.baseUrl, 12000);
  const texts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)]
    .map((m) => m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/<[^>]*>/g, ' ').trim())
    .filter(Boolean);
  if (texts.length === 0) throw new Error('Captions exist but came back empty.');
  return {
    videoId,
    title: title || videoId,
    transcript: texts.join(' ').replace(/\s+/g, ' ').slice(0, 12000),
    language: track.languageCode || 'unknown',
  };
}

/* ------------------------------------------------------------------ */
/*  GitHub: search + readme (token-aware when connected)                */
/* ------------------------------------------------------------------ */

async function githubHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'VIMO-marketing-ops',
  };
  try {
    const all = await db.select().from(connectors).all();
    const gh = all.find((c) => c.provider === 'github' && c.status === 'active');
    if (gh) {
      const token = await credentialStore.getCredential(gh.id, 'accessToken');
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    log.warn('github token lookup failed, continuing anonymous', { err: (err as Error).message });
  }
  return headers;
}

export async function searchGitHubRepos(query: string, limit = 5): Promise<GitHubRepo[]> {
  const headers = await githubHeaders();
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=${Math.min(limit, 10)}`,
    { signal: AbortSignal.timeout(12000), headers },
  );
  if (res.status === 403) throw new Error('GitHub rate limit hit (60/hr anonymous). Connect GitHub in VIMO for 5000/hr.');
  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  return (data?.items || []).slice(0, limit).map((r: any) => ({
    fullName: r.full_name,
    description: r.description || '',
    stars: r.stargazers_count ?? 0,
    url: r.html_url,
  }));
}

export async function readGitHubReadme(ownerRepo: string): Promise<{ fullName: string; readme: string }> {
  const clean = ownerRepo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!/^[^/]+\/[^/]+$/.test(clean)) throw new Error('Give a repo as owner/name.');
  const headers = await githubHeaders();
  const res = await fetch(`https://api.github.com/repos/${clean}/readme`, {
    signal: AbortSignal.timeout(12000),
    headers: { ...headers, Accept: 'application/vnd.github.raw' },
  });
  if (res.status === 404) throw new Error('No README found (or the repo is private).');
  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
  const text = await res.text();
  return { fullName: clean, readme: text.slice(0, 8000) };
}

/* ------------------------------------------------------------------ */
/*  RSS/Atom                                                            */
/* ------------------------------------------------------------------ */

export async function readRssFeed(feedUrl: string, limit = 8): Promise<RssItem[]> {
  const xml = await fetchText(feedUrl, 12000);
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const rawItems: any[] =
    doc?.rss?.channel?.item || doc?.feed?.entry || doc?.['rdf:RDF']?.item || [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];
  // Raw chunks preserve document order for snippets: the parser merges mixed
  // markup text nodes in the wrong order ("big We shippedthings."), while
  // tag-stripping the raw XML keeps words where the author put them.
  const rawChunks = [...xml.matchAll(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi)].map(
    (m) => m[0],
  );
  return list.slice(0, limit).map((item: any, idx: number) => {
    const link = typeof item.link === 'string'
      ? item.link
      : item.link?.['@_href'] || item.link?.['#text'] || item.id || '';
    const rawSnippet = rawChunks[idx]
      ? rawChunks[idx].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
    const text = rawSnippet ||
      xmlNodeText(item.description ?? item.summary ?? item.content ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return {
      title: xmlNodeText(item.title || '(untitled)').slice(0, 200) || '(untitled)',
      link: String(link),
      published: String(item.pubDate || item.published || item.updated || ''),
      snippet: text.slice(0, 500),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  X/Twitter: single-post read (keyless) + cookie slot for more        */
/* ------------------------------------------------------------------ */

export async function readXPost(tweetUrl: string): Promise<{ author: string; text: string; url: string }> {
  const res = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}`, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) {
    throw new Error(
      'Could not read that post (deleted, private, or login-walled). ' +
      'X search and timelines need your login cookies — connect X and paste them in the connector settings.',
    );
  }
  const data = (await res.json()) as any;
  const html: string = data?.html || '';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
  return { author: data?.author_name || '', text, url: data?.url || tweetUrl };
}

/* ------------------------------------------------------------------ */
/*  Doctor: per-channel availability                                    */
/* ------------------------------------------------------------------ */

export async function checkResearchChannels(): Promise<ChannelStatus[]> {
  const results: ChannelStatus[] = [];
  const probe = async (channel: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      results.push({ channel, available: true, detail: 'reachable' });
    } catch (err) {
      results.push({ channel, available: false, detail: (err as Error).message.slice(0, 120) });
    }
  };

  await probe('web', async () => {
    await fetchText('https://example.com', 8000);
  });
  await probe('reddit', async () => {
    await fetchText('https://www.reddit.com/r/all/hot.json?limit=1', 8000, { Accept: 'application/json' });
  });
  await probe('youtube', async () => {
    await fetchText('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ', 8000);
  });
  await probe('github', async () => {
    const headers = await githubHeaders();
    const res = await fetch('https://api.github.com/rate_limit', {
      signal: AbortSignal.timeout(8000),
      headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
  await probe('rss', async () => {
    await readRssFeed('https://hnrss.org/frontpage', 1);
  });
  await probe('x-post', async () => {
    await readXPost('https://x.com/X/status/1507774801372332032');
  });
  return results;
}
