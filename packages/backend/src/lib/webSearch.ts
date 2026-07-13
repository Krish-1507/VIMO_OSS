import { z } from 'zod';

const DDG_URL = 'https://api.duckduckgo.com/';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({ q: query, format: 'json', no_html: '1', skip_disambig: '1' });
    const res = await fetch(`${DDG_URL}?${params}`, {
      headers: { 'User-Agent': 'VIMO/1.0 (marketing assistant)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);

    const data = await res.json() as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{
        Text?: string;
        FirstURL?: string;
        Result?: string;
        Topics?: Array<{ Text?: string; FirstURL?: string }>;
      }>;
    };

    const results: SearchResult[] = [];

    if (data.AbstractText) {
      results.push({
        title: data.AbstractSource || 'Summary',
        url: data.AbstractURL || '',
        snippet: data.AbstractText.slice(0, 500),
      });
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= maxResults) break;
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            if (results.length >= maxResults) break;
            if (sub.Text) {
              results.push({
                title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 60),
                url: sub.FirstURL || '',
                snippet: sub.Text,
              });
            }
          }
        } else if (topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60),
            url: topic.FirstURL || '',
            snippet: topic.Text,
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.warn('[WebSearch] Search failed:', (err as Error).message);
    return [];
  }
}

export async function fetchUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VIMO/1.0 (marketing assistant)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 4000);
  } catch (err) {
    return `Failed to fetch URL: ${(err as Error).message}`;
  }
}
