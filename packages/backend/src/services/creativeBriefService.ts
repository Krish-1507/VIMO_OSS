/**
 * Creative brief builder — the anti-slop layer for generated visuals.
 *
 * Raw user prompts ("a coffee shop") produce generic AI-looking images.
 * This enriches every prompt with the brand's DNA (colors, aesthetic,
 * voice), a photographic/design craft direction, platform-correct sizing,
 * and explicit negatives (garbled text, watermarks, plastic skin). The
 * model still does the pixels — but it finally knows whose pixels they are.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles } from '../db/schema';

export type CreativeStyle = 'authentic' | 'minimal' | 'bold';

export interface CreativeBrief {
  prompt: string;
  width: number;
  height: number;
  style: CreativeStyle;
  platform: string;
}

const PLATFORM_DIMS: Record<string, { width: number; height: number }> = {
  instagram: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
  youtube: { width: 1920, height: 1080 },
  pinterest: { width: 1000, height: 1500 },
  linkedin: { width: 1200, height: 627 },
  x: { width: 1200, height: 675 },
  twitter: { width: 1200, height: 675 },
  facebook: { width: 1200, height: 630 },
};

const STYLE_DIRECTION: Record<CreativeStyle, string> = {
  authentic:
    'candid smartphone photography, natural light, real people in a real place, ' +
    'unpolished and genuine, shallow depth of field',
  minimal:
    'clean minimal design, generous whitespace, flat vector illustration, ' +
    'limited restrained palette, premium studio layout',
  bold:
    'high-contrast punchy advertising visual, dramatic cinematic lighting, ' +
    'vibrant saturated color, strong focal subject',
};

// The difference between a visual and AI slop, stated explicitly so every
// provider (which all read plain text) respects it.
const QUALITY_SUFFIX =
  'professional quality, sharp focus, balanced composition. ' +
  'Avoid: garbled or gibberish text, watermarks, logos, extra fingers or limbs, ' +
  'plastic skin, oversaturated stock-photo look.';

interface BrandDna {
  brandValues?: string[];
  brandAesthetic?: string;
  toneOfVoice?: string;
  uniqueSellingPoints?: string[];
  colors?: Record<string, string>;
  visualStyleKeywords?: string[];
  tagline?: string;
}

function parseDna(raw: unknown): BrandDna {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as BrandDna;
  } catch {
    // corrupted DNA — proceed without it rather than failing the visual
  }
  return {};
}

/**
 * Build a complete generation brief from a raw idea. Never throws: without
 * a brand (or with corrupt DNA) it returns the original prompt with sane
 * platform sizing, so callers can use it unconditionally.
 */
export function buildCreativePrompt(params: {
  brandProfileId?: string | null;
  prompt: string;
  platform?: string;
  style?: CreativeStyle;
  width?: number;
  height?: number;
}): CreativeBrief {
  const platform = (params.platform || 'instagram').toLowerCase();
  const style: CreativeStyle =
    params.style === 'minimal' || params.style === 'bold' ? params.style : 'authentic';
  const dims = PLATFORM_DIMS[platform] || PLATFORM_DIMS.instagram;
  const base = params.prompt.trim();

  let brand: {
    name?: string | null;
    industry?: string | null;
    contentDNA?: string | null;
  } | null = null;
  let dna: BrandDna = {};
  let brandName = '';
  let industry = '';
  try {
    if (params.brandProfileId) {
      const row = db
        .select()
        .from(brandProfiles)
        .where(eq(brandProfiles.id, params.brandProfileId))
        .get() as any;
      if (row) {
        brand = row;
        brandName = row.name || '';
        industry = row.industry || '';
        dna = parseDna(row.contentDNA);
      }
    }
  } catch {
    brand = null;
  }

  if (!brand) {
    return {
      prompt: `${base}, ${STYLE_DIRECTION[style]}, ${QUALITY_SUFFIX}`,
      width: params.width || dims.width,
      height: params.height || dims.height,
      style,
      platform,
    };
  }

  const parts: string[] = [base];
  const identity = [brandName, industry].filter(Boolean).join(', ');
  if (identity) parts.push(`for the brand ${identity}`);
  if (dna.brandAesthetic) parts.push(`brand aesthetic: ${dna.brandAesthetic}`);
  const colorValues = dna.colors ? Object.values(dna.colors).filter(Boolean) : [];
  if (colorValues.length > 0) parts.push(`using brand colors like ${colorValues.slice(0, 3).join(', ')}`);
  if (dna.visualStyleKeywords && dna.visualStyleKeywords.length > 0) {
    parts.push(`visual style: ${dna.visualStyleKeywords.slice(0, 4).join(', ')}`);
  }
  if (dna.toneOfVoice) parts.push(`mood matching a ${dna.toneOfVoice} brand voice`);
  parts.push(STYLE_DIRECTION[style]);
  parts.push(QUALITY_SUFFIX);

  return {
    prompt: parts.join('. '),
    width: params.width || dims.width,
    height: params.height || dims.height,
    style,
    platform,
  };
}
