import { eq } from 'drizzle-orm';
import { db } from '../db';
import { installedPacks } from '../db/schema';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import * as credentialStore from '../lib/credentialStore';
import axios from 'axios';
import { createLogger } from '../lib/logger';

const registry = new ConnectorRegistry(db);
const log = createLogger('pack:insights');

export interface PackInsight {
  packId: string;
  packName: string;
  category: string;
  dataPoints: { label: string; value: string }[];
  activitySummary: string;
  opportunities: string[];
  lastUpdated: string;
}

export interface DirectorPackContext {
  installedPacks: string[];
  insights: PackInsight[];
  summaryLine: string;
}

/* ------------------------------------------------------------------ */
/*  Real data fetchers — only called when a connector is active.       */
/*  If a pack has no active connector, or the fetch fails, it is   */
/*  simply omitted. VIMO never fabricates analytics.                    */
/* ------------------------------------------------------------------ */

type InsightData = Omit<PackInsight, 'packId' | 'packName' | 'category' | 'lastUpdated'>;

async function fetchRealGitHubInsights(): Promise<InsightData | null> {
  try {
    const allConnectors = await registry.getAll();
    const ghConnector = allConnectors.find((c) => c.provider === 'github' && c.status === 'active');
    if (!ghConnector) return null;

    const token = await credentialStore.getCredential(ghConnector.id, 'accessToken');
    if (!token) return null;

    const reposRes = await axios.get('https://api.github.com/user/repos', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      params: { per_page: 100, sort: 'updated' },
    });

    const repos = reposRes.data || [];
    const repoCount = repos.length;
    const activeRepos = repos.filter((r: any) => r.pushed_at && new Date(r.pushed_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;

    return {
      dataPoints: [
        { label: 'Repositories', value: String(repoCount) },
        { label: 'Active repos (7d)', value: String(activeRepos) },
      ],
      activitySummary: `Connected to GitHub with ${repoCount} repositories, ${activeRepos} active this week.`,
      opportunities: [
        'Write a launch post highlighting recent development activity',
        'Create changelog content showing product velocity',
      ],
    };
  } catch {
    return null;
  }
}

async function fetchRealCanvaInsights(): Promise<InsightData | null> {
  try {
    const allConnectors = await registry.getAll();
    const canvaConnector = allConnectors.find((c) => c.provider === 'canva' && c.status === 'active');
    if (!canvaConnector) return null;

    const token = await credentialStore.getCredential(canvaConnector.id, 'accessToken');
    if (!token) return null;

    const res = await axios.get('https://api.canva.com/rest/v1/templates', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const templates = res.data?.data || [];
    return {
      dataPoints: [
        { label: 'Templates available', value: String(templates.length) },
        { label: 'Brand connected', value: 'Yes' },
      ],
      activitySummary: `Canva connected with ${templates.length} templates available for content creation.`,
      opportunities: [
        'Generate campaign creative using Canva templates',
        'Create social media assets from brand templates',
      ],
    };
  } catch {
    return null;
  }
}

async function fetchRealNotionInsights(): Promise<InsightData | null> {
  try {
    const allConnectors = await registry.getAll();
    const notionConnector = allConnectors.find((c) => c.provider === 'notion' && c.status === 'active');
    if (!notionConnector) return null;

    const token = await credentialStore.getCredential(notionConnector.id, 'accessToken');
    if (!token) return null;

    const searchRes = await axios.post(
      'https://api.notion.com/v1/search',
      { filter: { value: 'page', property: 'object' } },
      { headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' } },
    );

    const pages = searchRes.data?.results || [];
    return {
      dataPoints: [
        { label: 'Pages accessible', value: String(pages.length) },
        { label: 'Databases accessible', value: String(pages.filter((p: any) => p.object === 'database').length) },
      ],
      activitySummary: `Notion connected with ${pages.length} accessible pages for content inspiration.`,
      opportunities: [
        'Turn documentation into thought leadership posts',
        'Generate content ideas from meeting notes',
      ],
    };
  } catch {
    return null;
  }
}

const realDataFetchers: Record<string, () => Promise<InsightData | null>> = {
  github: fetchRealGitHubInsights,
  canva: fetchRealCanvaInsights,
  notion: fetchRealNotionInsights,
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export async function getPackInsightsForDirector(brandProfileId: string): Promise<DirectorPackContext> {
  try {
    const installed = await db
      .select()
      .from(installedPacks)
      .where(eq(installedPacks.brandProfileId, brandProfileId))
      .all();

    if (installed.length === 0) {
      return {
        installedPacks: [],
        insights: [],
        summaryLine: 'No packs installed.',
      };
    }

    const insights: PackInsight[] = [];
    const now = new Date().toISOString();

    for (const pack of installed) {
      const providerId = pack.packId;

      const realFetcher = realDataFetchers[providerId];
      if (!realFetcher) continue;

      let raw: InsightData | null = null;
      try {
        raw = await realFetcher();
      } catch {
        raw = null;
      }

      // Only surface real data. Packs without an active connector,
      // or whose fetch failed, are intentionally omitted — never faked.
      if (!raw) continue;

      insights.push({
        packId: providerId,
        packName: pack.packName,
        category: pack.category,
        ...raw,
        lastUpdated: now,
      });
    }

    const packNames = insights.map((i) => i.packName).join(', ');
    const activeCount = insights.filter((i) => i.activitySummary.length > 0).length;

    const summaryLine =
      activeCount > 0
        ? `Connected packs (${insights.length}): ${packNames}. Key signals detected from ${activeCount} active pack(s).`
        : `Connected packs (${insights.length}): ${packNames}.`;

    return {
      installedPacks: installed.map((p) => p.packId),
      insights,
      summaryLine,
    };
  } catch (err) {
    log.warn('Error fetching insights', { err: (err as Error).message });
    return {
      installedPacks: [],
      insights: [],
      summaryLine: 'Pack insights unavailable.',
    };
  }
}

export async function getPackInsightsPromptBlock(brandProfileId: string): Promise<string> {
  const ctx = await getPackInsightsForDirector(brandProfileId);

  if (ctx.insights.length === 0) {
    return '';
  }

  const parts = ctx.insights.map((insight) => {
    const dataStr = insight.dataPoints
      .map((d) => `  - ${d.label}: ${d.value}`)
      .join('\n');
    const oppStr = insight.opportunities
      .slice(0, 2)
      .map((o) => `  - ${o}`)
      .join('\n');
    return `${insight.packName} (${insight.category}):\n${dataStr}\nActivities: ${insight.activitySummary}\nOpportunities:\n${oppStr}`;
  });

  return `\n\n--- Installed Packs Intelligence ---\n${ctx.summaryLine}\n\n${parts.join('\n\n')}`;
}
