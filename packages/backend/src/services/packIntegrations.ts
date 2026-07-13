/**
 * Pack Marketplace Integrations
 *
 * Real connections between the Pack Marketplace and external services.
 * Each adapter authenticates with the stored connector credentials, pulls
 * live data from the provider, and records the sync result on the connector
 * so VIMO can act autonomously on fresh data.
 */

import axios from 'axios';
import { ExternalConnection, createExternalConnection, connectionRegistry } from './externalConnection';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { db } from '../db';
import * as credentialStore from '../lib/credentialStore';
import { createLogger } from '../lib/logger';

const log = createLogger('pack:integrations');

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export type PackType = 'knowledge' | 'intelligence' | 'creative' | 'social' | 'analytics';

export interface PackConnection {
  id: string;
  packId: string;
  name: string;
  provider: string;
  packType: PackType;
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  lastSyncAt: Date | null;
  lastError: string | null;
  dataPoints: number;
  health: 'healthy' | 'degraded' | 'unhealthy';
}

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  errors: string[];
  newDataFound: boolean;
}

/**
 * Write-back payload. VIMO doesn't just *read* a tool's data — with a
 * bidirectional adapter it can *operate* the tool. `type` selects what to
 * create (a Shopify draft product, a Notion page, …) and the remaining
 * fields are passed through to the provider.
 */
export interface PackWritePayload {
  type: 'shopify_draft_product' | 'notion_page';
  title: string;
  body?: string;
  /** Shopify: variant price (string or number). */
  price?: string | number;
  /** Notion: parent page id. Falls back to the connector's configured parent. */
  notionParent?: string;
  meta?: Record<string, unknown>;
}

export interface PackWriteResult {
  success: boolean;
  externalId?: string;
  url?: string;
  error?: string;
}

/* ================================================================== */
/*  Base Pack Adapter                                                  */
/* ================================================================== */

abstract class PackAdapter {
  protected registry: ConnectorRegistry;

  constructor() {
    this.registry = new ConnectorRegistry(db);
  }

  abstract getPackType(): PackType;
  abstract sync(connectorId: string): Promise<SyncResult>;
  abstract getStatus(connectorId: string): Promise<PackConnection>;

  /**
   * Bidirectional capability. Most Pack adapters are *read-only discovery*
   * (VIMO reads your tools). Adapters that override this actually *operate*
   * the tool — e.g. push a draft product to Shopify or a page to Notion.
   * The base implementation is intentionally read-only so existing adapters
   * keep working unchanged.
   */
  supportsWrite(): boolean {
    return false;
  }

  async write(_connectorId: string, _payload: PackWritePayload): Promise<PackWriteResult> {
    return { success: false, error: 'This Pack adapter is read-only (discovery only).' };
  }

  protected async getConnector(connectorId: string) {
    return this.registry.getById(connectorId);
  }

  protected async getCredentials(connectorId: string, key: string): Promise<string | null> {
    return credentialStore.getCredential(connectorId, key);
  }

  /** Persist the outcome of a sync onto the connector config. */
  protected async recordSync(
    connectorId: string,
    result: { success: boolean; dataPoints: number; error?: string },
  ): Promise<void> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) return;
      const config = (connector.config || {}) as Record<string, unknown>;
      config.vimoPackSync = {
        lastSyncAt: new Date().toISOString(),
        dataPoints: result.dataPoints,
        lastError: result.error || null,
        success: result.success,
      };
      await this.registry.updateConfig(connectorId, config);
    } catch (err) {
      log.error('Failed to record sync', { connectorId, err: (err as Error).message });
    }
  }

  protected connectionHealth(provider: string) {
    return connectionRegistry.get(provider)?.getHealth() || null;
  }

  protected buildStatus(
    connector: { id: string; name: string; provider: string; status: string; config?: Record<string, any> } | null,
    provider: string,
    name: string,
    packType: PackType,
    health: ReturnType<PackAdapter['connectionHealth']>,
  ): PackConnection {
    return buildStatusFrom(connector, provider, name, packType, health);
  }
}

/* ================================================================== */
/*  Knowledge Pack Adapters                                            */
/* ================================================================== */

class GitHubAdapter extends PackAdapter {
  getPackType(): PackType { return 'knowledge'; }

  async sync(connectorId: string): Promise<SyncResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const token = await this.getCredentials(connectorId, 'accessToken');
      if (!token) throw new Error('GitHub token not found');

      const connection = createExternalConnection('github-pack', 'https://api.github.com', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const reposRes = await connection.get('/user/repos', { params: { per_page: 100, sort: 'updated' } });
      const repos = (reposRes.data as Array<{ name: string; description: string; updated_at: string }>) || [];
      const dataPoints = repos.length;

      await this.recordSync(connectorId, { success: true, dataPoints });
      return { success: true, itemsSynced: dataPoints, errors: [], newDataFound: dataPoints > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
    }
  }

  async getStatus(connectorId: string): Promise<PackConnection> {
    const connector = await this.getConnector(connectorId);
    const health = this.connectionHealth('github-pack');
    return this.buildStatus(connector, 'github', 'GitHub', 'knowledge', health);
  }
}

class NotionAdapter extends PackAdapter {
  getPackType(): PackType { return 'knowledge'; }

  async sync(connectorId: string): Promise<SyncResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const token = await this.getCredentials(connectorId, 'integrationToken');
      if (!token) throw new Error('Notion token not found');

      const connection = createExternalConnection('notion-pack', 'https://api.notion.com/v1', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
      });

      // Notion search uses a JSON body, not query params.
      const searchRes = await connection.post('/search', {
        filter: { property: 'object', value: 'page' },
        page_size: 100,
      });
      const results = (searchRes.data as { results?: any[] }).results || [];
      const databases = results.filter((r) => r.object === 'database');
      const dataPoints = results.length;

      await this.recordSync(connectorId, { success: true, dataPoints });
      return {
        success: true,
        itemsSynced: dataPoints,
        errors: [],
        newDataFound: dataPoints > 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
    }
  }

  async getStatus(connectorId: string): Promise<PackConnection> {
    const connector = await this.getConnector(connectorId);
    const health = this.connectionHealth('notion-pack');
    return this.buildStatus(connector, 'notion', 'Notion', 'knowledge', health);
  }

  supportsWrite(): boolean {
    return true;
  }

  /**
   * Bidirectional: create a Notion page from a VIMO insight. The page lands
   * under the connector's configured parent page (or `payload.notionParent`),
   * turning "VIMO read your Notion" into "VIMO writes to your Notion".
   */
  async write(connectorId: string, payload: PackWritePayload): Promise<PackWriteResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const token = await this.getCredentials(connectorId, 'integrationToken');
      if (!token) throw new Error('Notion token not found');

      const config = (connector.config || {}) as Record<string, any>;
      const parentPageId = payload.notionParent || config.notionParentPageId;
      if (!parentPageId) throw new Error('No Notion parent page configured for this connection');

      const connection = createExternalConnection('notion-pack', 'https://api.notion.com/v1', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
      });

      const res = await connection.post('/pages', {
        parent: { page_id: parentPageId },
        properties: {
          title: { title: [{ text: { content: payload.title } }] },
        },
        children: payload.body
          ? [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: payload.body } }] },
              },
            ]
          : [],
      });

      const page = (res.data as { id?: string; url?: string }) || {};
      if (!page.id) throw new Error('Notion did not return a page id');

      await this.recordSync(connectorId, { success: true, dataPoints: 1 });
      return { success: true, externalId: page.id, url: page.url };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, error: message };
    }
  }
}

/* ================================================================== */
/*  Intelligence Pack Adapters                                         */
/* ================================================================== */

class SEOAdapter extends PackAdapter {
  getPackType(): PackType { return 'intelligence'; }

  async sync(connectorId: string): Promise<SyncResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const config = (connector.config || {}) as Record<string, any>;
      const websiteUrl: string | undefined =
        config.websiteUrl || config.url || (await this.getCredentials(connectorId, 'websiteUrl')) || undefined;

      if (!websiteUrl) {
        const message = 'No website URL configured for SEO analysis.';
        await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
        return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
      }

      const cleanUrl = websiteUrl.replace(/\/+$/, '');
      const res = await axios.get(cleanUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VIMO-Bot)' },
      });
      const html = typeof res.data === 'string' ? res.data : '';
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
      const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
      const dataPoints = titleMatch || descMatch || h1Count ? h1Count + 2 : 0;

      await this.recordSync(connectorId, { success: true, dataPoints });
      return { success: true, itemsSynced: dataPoints, errors: [], newDataFound: dataPoints > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
    }
  }

  async getStatus(connectorId: string): Promise<PackConnection> {
    const connector = await this.getConnector(connectorId);
    return this.buildStatus(connector, 'seo', 'SEO Monitoring', 'intelligence', null);
  }
}

class WebsiteAnalyticsAdapter extends PackAdapter {
  getPackType(): PackType { return 'intelligence'; }

  async sync(connectorId: string): Promise<SyncResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const config = (connector.config || {}) as Record<string, any>;
      const websiteUrl: string | undefined =
        config.websiteUrl || (await this.getCredentials(connectorId, 'websiteUrl')) || undefined;

      if (!websiteUrl) {
        const message = 'No website URL configured for analytics.';
        await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
        return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
      }

      const cleanUrl = websiteUrl.replace(/\/+$/, '');
      const res = await axios.get(cleanUrl, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = typeof res.data === 'string' ? res.data : '';
      const hasGA = html.includes('gtag') || html.includes('analytics.js') || html.includes('ga(');
      const hasGTM = html.includes('googletagmanager');
      const dataPoints = hasGA || hasGTM ? 1 : 0;

      await this.recordSync(connectorId, { success: true, dataPoints });
      return { success: true, itemsSynced: dataPoints, errors: [], newDataFound: dataPoints > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
    }
  }

  async getStatus(connectorId: string): Promise<PackConnection> {
    const connector = await this.getConnector(connectorId);
    return this.buildStatus(connector, 'website-analytics', 'Website Analytics', 'intelligence', null);
  }
}

/* ================================================================== */
/*  Creative / Commerce Pack Adapters                                  */
/* ================================================================== */

class CanvaAdapter extends PackAdapter {
  getPackType(): PackType { return 'creative'; }

  async sync(connectorId: string): Promise<SyncResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const token = await this.getCredentials(connectorId, 'accessToken');
      if (!token) throw new Error('Canva token not found');

      const connection = createExternalConnection('canva-pack', 'https://api.canva.com/rest/v1', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const designsRes = await connection.get('/designs', { params: { page_size: 50 } });
      const designs = (designsRes.data as { items?: any[] }).items || [];

      await this.recordSync(connectorId, { success: true, dataPoints: designs.length });
      return { success: true, itemsSynced: designs.length, errors: [], newDataFound: designs.length > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
    }
  }

  async getStatus(connectorId: string): Promise<PackConnection> {
    const connector = await this.getConnector(connectorId);
    const health = this.connectionHealth('canva-pack');
    return this.buildStatus(connector, 'canva', 'Canva', 'creative', health);
  }
}

class ShopifyAdapter extends PackAdapter {
  getPackType(): PackType { return 'creative'; }

  async sync(connectorId: string): Promise<SyncResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const apiKey = await this.getCredentials(connectorId, 'apiKey');
      const shopDomain = await this.getCredentials(connectorId, 'shopDomain');
      if (!apiKey || !shopDomain) throw new Error('Shopify credentials not found');

      const connection = createExternalConnection('shopify-pack', `https://${shopDomain}/admin/api/2024-01`, {
        headers: { 'X-Shopify-Access-Token': apiKey },
      });

      const productsRes = await connection.get('/products.json', { params: { limit: 50 } });
      const products = (productsRes.data as { products?: any[] }).products || [];

      await this.recordSync(connectorId, { success: true, dataPoints: products.length });
      return { success: true, itemsSynced: products.length, errors: [], newDataFound: products.length > 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, itemsSynced: 0, errors: [message], newDataFound: false };
    }
  }

  async getStatus(connectorId: string): Promise<PackConnection> {
    const connector = await this.getConnector(connectorId);
    const health = this.connectionHealth('shopify-pack');
    return this.buildStatus(connector, 'shopify', 'Shopify', 'creative', health);
  }

  supportsWrite(): boolean {
    return true;
  }

  /**
   * Bidirectional: push a *draft* product to Shopify so a human can review
   * and publish it inside Shopify. This is the "VIMO operates your tools"
   * moment — VIMO turns an insight into a real, editable Shopify draft.
   */
  async write(connectorId: string, payload: PackWritePayload): Promise<PackWriteResult> {
    try {
      const connector = await this.getConnector(connectorId);
      if (!connector) throw new Error('Connector not found');

      const apiKey = await this.getCredentials(connectorId, 'apiKey');
      const shopDomain = await this.getCredentials(connectorId, 'shopDomain');
      if (!apiKey || !shopDomain) throw new Error('Shopify credentials not found');

      const connection = createExternalConnection('shopify-pack', `https://${shopDomain}/admin/api/2024-01`, {
        headers: { 'X-Shopify-Access-Token': apiKey },
      });

      const res = await connection.post('/products.json', {
        product: {
          title: payload.title,
          body_html: payload.body || '',
          // Draft = not published. A human reviews/publishes in Shopify.
          published: false,
          variants: [{ price: String(payload.price ?? '0.00') }],
        },
      });

      const product = (res.data as { product?: { id?: number | string; handle?: string } })?.product;
      if (!product?.id) throw new Error('Shopify did not return a product id');

      await this.recordSync(connectorId, { success: true, dataPoints: 1 });
      return {
        success: true,
        externalId: String(product.id),
        url: `https://${shopDomain}/admin/products/${product.id}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.recordSync(connectorId, { success: false, dataPoints: 0, error: message });
      return { success: false, error: message };
    }
  }
}

/* ================================================================== */
/*  Shared status builder                                              */
/* ================================================================== */

interface ConnectorLike {
  id: string;
  name: string;
  provider: string;
  status: string;
  config?: Record<string, any>;
}

/* eslint-disable @typescript-eslint/no-namespace */
function buildStatusFrom(
  connector: ConnectorLike | null,
  provider: string,
  name: string,
  packType: PackType,
  health: ReturnType<PackAdapter['connectionHealth']>,
): PackConnection {
  const sync = connector?.config?.vimoPackSync as
    | { lastSyncAt?: string; dataPoints?: number; lastError?: string; success?: boolean }
    | undefined;

  const connected = connector?.status === 'active';
  const unhealthy = sync?.success === false;

  return {
    id: connector?.id || provider,
    packId: provider,
    name: connector?.name || name,
    provider,
    packType,
    status: connected ? (unhealthy ? 'error' : 'connected') : 'disconnected',
    lastSyncAt: sync?.lastSyncAt ? new Date(sync.lastSyncAt) : null,
    lastError: sync?.lastError || null,
    dataPoints: sync?.dataPoints || 0,
    health: !connected || unhealthy ? 'unhealthy' : (health?.status || 'healthy') as PackConnection['health'],
  };
}

/* ================================================================== */
/*  Adapter Registry                                                   */
/* ================================================================== */

export class PackAdapterRegistry {
  private adapters: Map<string, PackAdapter> = new Map();

  constructor() {
    this.adapters.set('github', new GitHubAdapter());
    this.adapters.set('notion', new NotionAdapter());
    this.adapters.set('seo', new SEOAdapter());
    this.adapters.set('website-analytics', new WebsiteAnalyticsAdapter());
    this.adapters.set('canva', new CanvaAdapter());
    this.adapters.set('shopify', new ShopifyAdapter());
  }

  getAdapter(provider: string): PackAdapter | undefined {
    return this.adapters.get(provider);
  }

  getAllAdapters(): Map<string, PackAdapter> {
    return this.adapters;
  }
}

export const packAdapterRegistry = new PackAdapterRegistry();

export function createPackAdapter(provider: string): PackAdapter | undefined {
  return packAdapterRegistry.getAdapter(provider);
}
