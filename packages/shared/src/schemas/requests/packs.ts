/**
 * Pack marketplace request schemas.
 *
 * Mirrors the hand-rolled guards in `backend/src/routes/packInsights.ts`,
 * including the ones that existed to stop a bad client payload corrupting the
 * `configJson` blob.
 */

import { z } from 'zod';

/** A single discovery row rendered on a pack card. */
export const DiscoveryItemSchema = z.object({
  icon: z.string(),
  label: z.string(),
  value: z.string(),
});
export type DiscoveryItem = z.infer<typeof DiscoveryItemSchema>;

/**
 * `POST /api/packs/discover`
 *
 * `credentials` is optional: OAuth-backed packs discover with an empty bag.
 */
export const PackDiscoverSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  credentials: z.record(z.string()).optional(),
});
export type PackDiscoverRequest = z.infer<typeof PackDiscoverSchema>;

/**
 * `POST /api/packs/install`
 *
 * `config` is `z.record` rather than `z.object({}).passthrough()` so an array
 * is rejected — the handler spreads it into a config object, and spreading an
 * array silently produces numeric keys.
 */
export const PackInstallSchema = z.object({
  packId: z.string().min(1, 'packId is required'),
  packName: z.string().min(1, 'packName is required'),
  category: z.string().min(1, 'category is required'),
  brandProfileId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
  discoveryItems: z.array(DiscoveryItemSchema).optional(),
});
export type PackInstallRequest = z.infer<typeof PackInstallSchema>;

/**
 * `DELETE /api/packs/uninstall` — parameters arrive as a query string.
 *
 * `brandId` is a legacy alias for `brandProfileId`; the handler prefers
 * `brandProfileId` and falls back. Both stay accepted so existing clients keep
 * working.
 */
export const PackUninstallQuerySchema = z.object({
  packId: z.string().min(1, 'packId query parameter is required'),
  brandProfileId: z.string().min(1).optional(),
  brandId: z.string().min(1).optional(),
});
export type PackUninstallQuery = z.infer<typeof PackUninstallQuerySchema>;

/** `POST /api/pack-connections/:provider/write` */
export const PackProviderParamSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
});
export type PackProviderParam = z.infer<typeof PackProviderParamSchema>;

/**
 * `POST /api/pack-connections/:provider/write`
 *
 * `title` is the one required field the handler checks; the rest of the payload
 * is an opaque object the adapter knows about, so it stays permissive.
 */
export const PackWriteSchema = z.object({
  connectorId: z.string().min(1, 'connectorId is required'),
  payload: z
    .object({ title: z.string().min(1, 'payload.title is required') })
    .passthrough()
    .optional(),
});
export type PackWriteRequest = z.infer<typeof PackWriteSchema>;
