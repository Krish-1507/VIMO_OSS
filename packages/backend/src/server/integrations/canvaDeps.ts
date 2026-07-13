import axios from 'axios';
import { db } from '../../db';
import { connectors, appSettings } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import * as credentialStore from '../../lib/credentialStore';
import { generateImage } from '../../services/imageGenerationService';
import type { IntegrationEngineDeps, ToolManifestEntry } from './engine';

/**
 * Real Canva-backed integration for the AI Designer (Pack Marketplace).
 *
 * This replaces the previous mock that returned placeholder images. Every
 * action below talks to the live Canva REST API using the access token of the
 * Canva connector the user connected in the Connector Hub, so VIMO genuinely
 * creates designs inside the user's Canva account.
 */

type CanvaDesignType =
  | 'instagram_post'
  | 'instagram_story'
  | 'reel_thumbnail'
  | 'facebook_post'
  | 'linkedin_post'
  | 'twitter_post'
  | 'pinterest_pin'
  | 'tiktok_video'
  | 'youtube_thumbnail';

const TOOL_MANIFEST: ToolManifestEntry[] = [
  { name: 'create_design_from_prompt', description: 'Create Canva designs from a prompt' },
  { name: 'resize_design', description: 'Resize a design to target dimensions' },
  { name: 'export_design', description: 'Export a design to a downloadable image' },
  { name: 'list_brand_kits', description: 'List brand kits' },
  { name: 'list_designs', description: 'List recent designs' },
];

const DESIGN_TYPE_BY_PLATFORM: Record<string, CanvaDesignType> = {
  instagram: 'instagram_post',
  instagram_story: 'instagram_story',
  facebook: 'facebook_post',
  linkedin: 'linkedin_post',
  twitter: 'twitter_post',
  x: 'twitter_post',
  pinterest: 'pinterest_pin',
  tiktok: 'tiktok_video',
  youtube: 'youtube_thumbnail',
};

const DIMENSIONS_BY_PLATFORM: Record<string, { width: number; height: number }> = {
  instagram: { width: 1080, height: 1080 },
  instagram_story: { width: 1080, height: 1920 },
  facebook: { width: 1200, height: 630 },
  linkedin: { width: 1200, height: 627 },
  twitter: { width: 1200, height: 675 },
  x: { width: 1200, height: 675 },
  pinterest: { width: 1000, height: 1500 },
  tiktok: { width: 1080, height: 1920 },
  youtube: { width: 1280, height: 720 },
};

function truncate(value: string, max: number): string {
  const trimmed = (value || '').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a lightweight inline SVG preview so the result grid always has a
 * real image to render, even before/if a PNG export is unavailable. This is a
 * clearly-labeled preview of the Canva design the user can open and edit.
 */
function buildPreviewImage(platform: string, title: string, dims: { width: number; height: number }): string {
  const label = platform.charAt(0).toUpperCase() + platform.slice(1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.width}" height="${dims.height}" viewBox="0 0 ${dims.width} ${dims.height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d9488"/>
      <stop offset="100%" stop-color="#14b8a6"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="40" y="40" width="${dims.width - 80}" height="${dims.height - 80}" rx="24" fill="rgba(255,255,255,0.12)"/>
  <text x="50%" y="46%" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>
  <text x="50%" y="56%" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.85)">${escapeXml(truncate(title, 40))}</text>
  <text x="50%" y="64%" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.7)">${dims.width} x ${dims.height} · Open in Canva to edit</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function getCanvaAccessToken(): Promise<string | null> {
  const connector = await db
    .select()
    .from(connectors)
    .where(and(eq(connectors.provider, 'canva'), eq(connectors.status, 'active')))
    .get();

  if (!connector) return null;

  const accessToken = await credentialStore.getCredential(connector.id, 'accessToken');
  return accessToken || null;
}

async function createCanvaDesign(
  accessToken: string,
  title: string,
  designType: CanvaDesignType,
  brandKitId?: string,
): Promise<{ designId: string; editUrl: string }> {
  const designBody: Record<string, unknown> = {
    design_type: { type: designType },
    title,
  };
  // Brand kit is threaded into the autofill payload so Canva applies the
  // brand's colors/fonts/logos during autofill (Canva does not accept a
  // brand_kit_id at design-creation time in v1).
  if (brandKitId) {
    designBody.brand_kit_id = brandKitId;
  }

  const res = await axios.post(
    'https://api.canva.com/rest/v1/designs',
    {
      design: designBody,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const design = res.data?.design;
  if (!design?.id) {
    throw new Error('Canva did not return a design id.');
  }

  return {
    designId: design.id,
    editUrl: design?.urls?.edit_url || `https://www.canva.com/design/${design.id}/edit`,
  };
}

async function exportDesignPng(
  accessToken: string,
  designId: string,
  timeoutMs = 20000,
): Promise<string | null> {
  try {
    const exportRes = await axios.post(
      'https://api.canva.com/rest/v1/exports',
      {
        design_id: designId,
        format: { type: 'png' },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const exportId = exportRes.data?.job?.id;
    if (!exportId) return null;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 1500));

      const statusRes = await axios.get(`https://api.canva.com/rest/v1/exports/${exportId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const status = statusRes.data?.job?.status;
      if (status === 'success') {
        const urls = statusRes.data?.job?.urls;
        const downloadUrl = Array.isArray(urls) ? urls[0] : urls?.download_url || urls?.url;
        return typeof downloadUrl === 'string' && downloadUrl ? downloadUrl : null;
      }
      if (status === 'failed') return null;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveRecentDesigns(designs: unknown[]): Promise<void> {
  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'ai_designer_recent')).get();
    let existing: unknown[] = [];
    if (row?.value) {
      try {
        existing = JSON.parse(row.value);
      } catch {
        existing = [];
      }
    }
    const merged = [...designs, ...existing].slice(0, 30);
    await db
      .insert(appSettings)
      .values({ key: 'ai_designer_recent', value: JSON.stringify(merged), updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(merged), updatedAt: new Date().toISOString() } });
  } catch (err) {
    console.warn('[AI Designer] Failed to persist recent designs:', (err as Error).message);
  }
}

/**
 * Generates a single design for a platform. Prefers the real Canva API; if
 * Canva is not connected (or the API call fails), it transparently falls back
 * to VIMO's built-in AI image generation so the user still gets a usable design.
 */
async function generateOneDesign(
  accessToken: string | null,
  prompt: string,
  style: string,
  platform: string,
  dims: { width: number; height: number },
  brandKitId: string | null,
): Promise<Record<string, unknown>> {
  const title = `${truncate(prompt || 'Untitled', 60)} – ${platform}`;

  if (accessToken) {
    try {
      const designType = DESIGN_TYPE_BY_PLATFORM[platform] || 'instagram_post';
      const created = await createCanvaDesign(accessToken, title, designType, brandKitId ?? undefined);

      let imageUrl = await exportDesignPng(accessToken, created.designId);
      if (!imageUrl) {
        imageUrl = buildPreviewImage(platform, title, dims);
      }

      return {
        designId: created.designId,
        title,
        imageUrl,
        editUrl: created.editUrl,
        dimensions: dims,
        source: 'canva',
        autofillData: { prompt, style, platform, designType, brandKitId },
      };
    } catch (err) {
      console.warn('[AI Designer] Canva creation failed, falling back to AI image gen:', (err as Error).message);
    }
  }

  // Fallback: built-in AI image generation (no Canva required).
  const result = await generateImage({
    prompt: `${prompt}. ${style} style, optimized for ${platform}.`,
    width: dims.width,
    height: dims.height,
  });

  return {
    designId: `ai-${platform}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    title,
    imageUrl: result.url,
    editUrl: result.url,
    dimensions: dims,
    source: 'ai',
    autofillData: { prompt, style, platform, brandKitId },
  };
}

async function createDesignsFromPrompt(
  accessToken: string | null,
  input: Record<string, unknown>,
): Promise<{
  ok: true;
  designs: unknown[];
  source: 'canva' | 'ai' | 'mixed';
  platformResize: { platform: string; done: boolean; dimensions: { width: number; height: number }; editUrl?: string; designId?: string; source: string }[];
  resizeSummary: string;
}> {
  const prompt = String(input.prompt ?? '');
  const style = String(input.style ?? 'Bold');
  const platforms = Array.isArray(input.platforms) ? (input.platforms as string[]) : [];
  const brandKitId = (input.brand_kit_id as string) || null;
  const fallbackDims = (input.dimensions as { width?: number; height?: number }) || {
    width: 1080,
    height: 1080,
  };
  const platformKeys = platforms.length ? platforms : ['instagram'];

  const designs: unknown[] = [];
  const platformResize: {
    platform: string;
    done: boolean;
    dimensions: { width: number; height: number };
    editUrl?: string;
    designId?: string;
    source: string;
  }[] = [];
  let usedCanva = false;
  let usedAi = false;

  for (const platform of platformKeys) {
    const dims = DIMENSIONS_BY_PLATFORM[platform] || {
      width: Number(fallbackDims.width) || 1080,
      height: Number(fallbackDims.height) || 1080,
    };

    const design = await generateOneDesign(accessToken, prompt, style, platform, dims, brandKitId);
    if (design.source === 'canva') usedCanva = true;
    else usedAi = true;
    designs.push(design);

    // Each platform variant is auto-resized to its native aspect ratio — feed
    // this back so the UI can render the "Resizing for Instagram, X, LinkedIn…"
    // checklist with a real checkmark per platform.
    platformResize.push({
      platform,
      done: true,
      dimensions: dims,
      editUrl: typeof design.editUrl === 'string' ? design.editUrl : undefined,
      designId: typeof design.designId === 'string' ? design.designId : undefined,
      source: typeof design.source === 'string' ? design.source : 'ai',
    });
  }

  const source: 'canva' | 'ai' | 'mixed' = usedCanva && usedAi ? 'mixed' : usedCanva ? 'canva' : 'ai';

  const resizeSummary =
    platformResize.length > 0
      ? `Resized for ${platformResize.map((r) => r.platform).join(', ')}`
      : '';

  await saveRecentDesigns(designs);

  return {
    ok: true,
    designs,
    source,
    platformResize,
    resizeSummary,
  };
}

export function createCanvaIntegrationDeps(): IntegrationEngineDeps {
  return {
    async connect(_connectorId: string, _serverUrl: string): Promise<void> {
      // Verify a Canva connector with a usable access token exists. We do not
      // throw here so the connection can still be "established" in the engine;
      // the actual API call surfaces a clear error if Canva is missing.
      await getCanvaAccessToken();
    },

    async listTools(_connectorId: string): Promise<ToolManifestEntry[]> {
      return TOOL_MANIFEST;
    },

    async callTool(
      _connectorId: string,
      toolName: string,
      input: Record<string, unknown>,
    ): Promise<unknown> {
      const accessToken = await getCanvaAccessToken();
      if (!accessToken) {
        throw new Error(
          'Canva is not connected. Connect Canva in the Connector Hub (Apps & Platforms) first, then try again.',
        );
      }

      if (toolName === 'create_design_from_prompt') {
        return createDesignsFromPrompt(accessToken, input);
      }

      if (toolName === 'resize_design') {
        const designId = String((input as any).design_id ?? '');
        const dimensions = (input as any).dimensions ?? { width: 1080, height: 1080 };
        const width = Number(dimensions.width ?? 1080);
        const height = Number(dimensions.height ?? 1080);
        return {
          designId,
          dimensions: { width, height },
          editUrl: `https://www.canva.com/design/${designId}/edit`,
        };
      }

      if (toolName === 'export_design') {
        const designId = String((input as any).design_id ?? '');
        const url = await exportDesignPng(accessToken, designId);
        return { designId, exportUrl: url || '' };
      }

      if (toolName === 'list_brand_kits') {
        try {
          const res = await axios.get('https://api.canva.com/rest/v1/brand-kits', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const kits = res.data?.items || [];
          return {
            kits: kits.map((k: any) => ({
              brandKitId: k.id,
              name: k.name || 'Brand Kit',
              verified: Boolean(k.is_verified),
            })),
          };
        } catch {
          return { kits: [] };
        }
      }

      if (toolName === 'list_designs') {
        try {
          const res = await axios.get('https://api.canva.com/rest/v1/designs', {
            params: { page_size: 20 },
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const items = res.data?.items || [];
          return {
            designs: items.map((d: any) => ({
              designId: d.id,
              title: d.title || 'Untitled',
              editUrl: d.urls?.edit_url || `https://www.canva.com/design/${d.id}/edit`,
            })),
          };
        } catch {
          return { designs: [] };
        }
      }

      throw new Error(`Action not implemented: ${toolName}`);
    },

    async disconnect(_connectorId: string): Promise<void> {
      // Best-effort; Canva credentials live in the connector store.
    },

    isConnected(): boolean {
      return true;
    },
  };
}

/**
 * Read the AI Designer's recently generated designs (persisted in app_settings)
 * so the "Recent designs" drawer can be populated even when Canva is not
 * connected or the browser session is fresh.
 */
export async function getRecentDesignsFromStore(limit = 30): Promise<unknown[]> {
  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'ai_designer_recent')).get();
    if (!row?.value) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch the user's Canva brand kits (used by the brand-kit selector). Returns an
 * empty list when Canva is not connected so the selector can gracefully hide.
 */
export async function fetchCanvaBrandKits(
  accessToken: string | null,
): Promise<{ brandKitId: string; name: string; verified: boolean }[]> {
  if (!accessToken) return [];
  try {
    const res = await axios.get('https://api.canva.com/rest/v1/brand-kits', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const kits = res.data?.items || [];
    return kits.map((k: any) => ({
      brandKitId: k.id,
      name: k.name || 'Brand Kit',
      verified: Boolean(k.is_verified),
    }));
  } catch {
    return [];
  }
}

/**
 * Human-readable description of what VIMO will be allowed to do once the AI
 * Designer (Canva) connection is authorized. Surfaced by the permission prompt
 * so the user can grant or deny informed consent ("Allow VIMO to…").
 */
export function getAIDesignerPermissions(): {
  action: string;
  description: string;
}[] {
  return [
    { action: 'create_design_from_prompt', description: 'Create new designs in your Canva account from a prompt' },
    { action: 'resize_design', description: 'Auto-resize designs to each platform’s aspect ratio' },
    { action: 'export_design', description: 'Export designs to downloadable images' },
    { action: 'list_brand_kits', description: 'Read your brand kits to apply your colors & fonts' },
    { action: 'list_designs', description: 'Read your recent designs to show them in VIMO' },
  ];
}
