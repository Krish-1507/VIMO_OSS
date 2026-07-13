import { listHiggsfieldStyles } from '../connectors/native/higgsfieldNative';

type HiggsfieldStyle = {
  id: string;
  name: string;
  thumbnailUrl?: string;
};

const styleCache = new Map<string, { expiresAt: number; styles: HiggsfieldStyle[] }>();

export { HiggsfieldStyle };

export async function listStylesWithCache(apiKey: string): Promise<HiggsfieldStyle[]> {
  const cached = styleCache.get(apiKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.styles;

  const styles = await listHiggsfieldStyles(apiKey);
  styleCache.set(apiKey, {
    expiresAt: now + 60 * 60 * 1000,
    styles,
  });
  return styles;
}

