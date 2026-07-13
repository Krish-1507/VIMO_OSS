/**
 * MCP Workflow Service — "Generate This Week's Marketing" feature.
 *
 * Connects to all active MCP intelligence sources (GitHub, Notion, Slack),
 * harvests context from each, and uses LLM to create a complete weekly
 * content package.
 */

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { connectors } from '../db/schema';
import { PRESET_CONNECTORS } from '../connectors/presets';
import { callLLMWithFallback } from '../lib/llmErrorHandler';
import { getActiveLLMProvider } from '../lib/llmProvider';
import { generateText } from 'ai';
import { getBrandContext } from './brandMemoryService';
import * as credentialStore from '../lib/credentialStore';

export interface WeeklyContentPackage {
  weeklyTheme: string;
  linkedInPost: { content: string; hashtags: string[] };
  twitterThread: { tweets: string[] };
  instagramCaption: { content: string; hashtags: string[] };
  newsletterSection: { subject: string; body: string };
  videoScriptIdea: string;
  rawSources: {
    github?: string;
    notion?: string;
    slack?: string;
  };
}

/**
 * Get all active MCP connectors for a brand profile.
 */
async function getActiveMCPConnectors() {
  const allConnectors = await db.select().from(connectors).all();
  const mcpPresets = PRESET_CONNECTORS.filter((p) => p.connectorArchitecture === 'mcp');
  const mcpProviderIds = new Set(mcpPresets.map((p) => p.provider));

  return allConnectors.filter(
    (c) => c.status === 'active' && mcpProviderIds.has(c.provider)
  );
}

/**
 * Harvest context from a GitHub MCP connector.
 */
async function harvestGitHubContext(connectorId: string): Promise<string> {
  try {
    const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
    if (!accessToken) return 'GitHub: No access token available.';

    // Use GitHub API to get recent commits from repos
    const axios = (await import('axios')).default;

    // Get repos the user has access to
    const reposRes = await axios.get('https://api.github.com/user/repos', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
      params: { sort: 'pushed', per_page: 5 },
    });

    const repos = reposRes.data || [];
    const commitSummaries: string[] = [];

    for (const repo of repos.slice(0, 3)) {
      const commitsRes = await axios.get(
        `https://api.github.com/repos/${repo.full_name}/commits`,
        {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
          params: { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), per_page: 10 },
        }
      );

      const commits = commitsRes.data || [];
      if (commits.length > 0) {
        commitSummaries.push(
          `${repo.full_name}: ${commits.length} commits - ` +
          commits.slice(0, 5).map((c: any) =>
            `"${c.commit.message.split('\n')[0]}" (${c.commit.author.name})`
          ).join(', ')
        );
      }
    }

    if (commitSummaries.length === 0) return 'GitHub: No recent commits in the past 7 days.';
    return 'GitHub commits this week:\n' + commitSummaries.join('\n');
  } catch (err) {
    return `GitHub: Error fetching data - ${(err as Error).message}`;
  }
}

/**
 * Harvest context from a Notion MCP connector.
 */
async function harvestNotionContext(connectorId: string): Promise<string> {
  try {
    const integrationToken = await credentialStore.getCredential(connectorId, 'integrationToken');
    if (!integrationToken) return 'Notion: No integration token available.';

    const axios = (await import('axios')).default;

    // List all databases the integration has access to
    const searchRes = await axios.post(
      'https://api.notion.com/v1/search',
      { filter: { value: 'database', property: 'object' } },
      {
        headers: {
          Authorization: `Bearer ${integrationToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
      }
    );

    const databases = searchRes.data?.results || [];
    const pageSummaries: string[] = [];

    for (const db_ of databases.slice(0, 3)) {
      const dbId = db_.id;
      if (!dbId) continue;

      // Query pages updated this week
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const queryRes = await axios.post(
        `https://api.notion.com/v1/databases/${dbId}/query`,
        {
          filter: {
            timestamp: 'last_edited_time',
            last_edited_time: { after: oneWeekAgo },
          },
          page_size: 10,
        },
        {
          headers: {
            Authorization: `Bearer ${integrationToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
        }
      );

      const pages = queryRes.data?.results || [];
      if (pages.length > 0) {
        // Extract page titles
        const titles = pages.map((p: any) => {
          const titleProp = Object.values(p.properties || {}).find(
            (v: any) => v.type === 'title'
          ) as any;
          return titleProp?.title?.[0]?.text?.content || 'Untitled';
        });
        pageSummaries.push(
          `Database "${db_.title?.[0]?.text?.content || dbId.slice(0, 8)}": ${pages.length} pages updated - ${titles.join(', ')}`
        );
      }
    }

    if (pageSummaries.length === 0) return 'Notion: No pages updated in the past 7 days.';
    return 'Notion pages updated this week:\n' + pageSummaries.join('\n');
  } catch (err) {
    return `Notion: Error fetching data - ${(err as Error).message}`;
  }
}

/**
 * Harvest context from a Slack MCP connector.
 */
async function harvestSlackContext(connectorId: string): Promise<string> {
  try {
    const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
    if (!accessToken) return 'Slack: No access token available.';

    const axios = (await import('axios')).default;

    // Get list of channels
    const channelsRes = await axios.get('https://slack.com/api/conversations.list', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { types: 'public_channel,private_channel', limit: 10 },
    });

    const channels = channelsRes.data?.channels || [];
    const messageSummaries: string[] = [];

    const targetChannels = ['wins', 'marketing', 'launches', 'general', 'announcements'];
    const selectedChannels = channels.filter((c: any) =>
      targetChannels.some((name) => c.name?.toLowerCase().includes(name))
    );

    for (const channel of selectedChannels.slice(0, 5)) {
      const oneWeekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

      const messagesRes = await axios.get('https://slack.com/api/conversations.history', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { channel: channel.id, oldest: oneWeekAgo, limit: 10 },
      });

      const messages = messagesRes.data?.messages || [];
      if (messages.length > 0) {
        const recent = messages.slice(0, 5).map((m: any) => {
          const text = m.text?.replace(/\n/g, ' ') || '';
          return text.length > 150 ? text.slice(0, 150) + '...' : text;
        });
        messageSummaries.push(
          `#${channel.name}: ${messages.length} messages - "${recent.join('" | "')}"`
        );
      }
    }

    if (messageSummaries.length === 0) return 'Slack: No recent messages in target channels.';
    return 'Slack announcements this week:\n' + messageSummaries.join('\n');
  } catch (err) {
    return `Slack: Error fetching data - ${(err as Error).message}`;
  }
}

/**
 * Generate a weekly content package from all active MCP sources.
 */
export async function generateWeeklyContentFromMCPSources(
  brandProfileId: string
): Promise<WeeklyContentPackage> {
  const activeMcpConnectors = await getActiveMCPConnectors();

  // Harvest context from each active MCP connector
  let commitSummary = '';
  let notionSummary = '';
  let slackSummary = '';

  for (const conn of activeMcpConnectors) {
    if (conn.provider === 'github') {
      commitSummary = await harvestGitHubContext(conn.id);
    } else if (conn.provider === 'notion') {
      notionSummary = await harvestNotionContext(conn.id);
    } else if (conn.provider === 'slack') {
      slackSummary = await harvestSlackContext(conn.id);
    }
  }

  // Get brand context
  const brandContext = await getBrandContext(brandProfileId, 'weekly content generation');

  const { provider, modelId } = await getActiveLLMProvider('weekly content generation');

  const prompt = `You are creating this week's marketing content for a brand. Here is everything that happened this week across their tools:

GitHub commits this week:
${commitSummary || 'No GitHub data available.'}

Notion pages updated:
${notionSummary || 'No Notion data available.'}

Slack announcements:
${slackSummary || 'No Slack data available.'}

Brand: ${brandContext}

Based on all of this, what is the most important marketing story this week? Create a complete content package.

Return ONLY valid JSON matching this structure:
{
  "weeklyTheme": "string — one unifying theme for all content this week",
  "linkedInPost": { "content": "string — full LinkedIn post content", "hashtags": ["string"] },
  "twitterThread": { "tweets": ["string — each tweet in the thread"] },
  "instagramCaption": { "content": "string — Instagram caption", "hashtags": ["string"] },
  "newsletterSection": { "subject": "string", "body": "string — full newsletter section" },
  "videoScriptIdea": "string — a 30-60 second script idea"
}`;

  const text = await callLLMWithFallback(
    async () => {
      const { text: t } = await generateText({
        model: provider.chat(modelId),
        prompt,
      });
      return t;
    },
    () => JSON.stringify({
      weeklyTheme: 'Weekly roundup of progress and insights',
      linkedInPost: { content: 'We had a productive week. Check out the highlights.', hashtags: ['#growth', '#teamwork'] },
      twitterThread: { tweets: ['Big week for us. Here is what happened.'] },
      instagramCaption: { content: 'Behind the scenes of our week 🚀', hashtags: ['#progress', '#weeklyupdate'] },
      newsletterSection: { subject: 'This week in review', body: 'Here is what we accomplished this week.' },
      videoScriptIdea: 'Quick recap of the week with key wins and lessons learned',
    }),
    'weekly content generation'
  );

  const parsed = JSON.parse(text.trim());

  return {
    weeklyTheme: parsed.weeklyTheme || 'Weekly update',
    linkedInPost: parsed.linkedInPost || { content: '', hashtags: [] },
    twitterThread: parsed.twitterThread || { tweets: [] },
    instagramCaption: parsed.instagramCaption || { content: '', hashtags: [] },
    newsletterSection: parsed.newsletterSection || { subject: '', body: '' },
    videoScriptIdea: parsed.videoScriptIdea || '',
    rawSources: {
      github: commitSummary || undefined,
      notion: notionSummary || undefined,
      slack: slackSummary || undefined,
    },
  };
}
