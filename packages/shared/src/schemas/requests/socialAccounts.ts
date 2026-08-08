/**
 * Social account request schemas.
 *
 * Mirrors the hand-rolled guards in `backend/src/routes/socialAccounts.ts`,
 * including the Bluesky-specific handle + app-password rules.
 *
 * WARNING: parsed values here contain live secrets (client secrets, app
 * passwords). Never log a parsed result, and never echo one back to a client.
 */

import { z } from 'zod';

/** `POST /api/social-accounts/save-credentials` */
export const SaveSocialCredentialsSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  clientId: z.string().min(1, 'clientId is required'),
  // Optional: the handler keeps any previously stored secret when this is
  // absent, which is how the UI supports editing a client id in isolation.
  clientSecret: z.string().optional(),
});
export type SaveSocialCredentialsRequest = z.infer<typeof SaveSocialCredentialsSchema>;

/**
 * `POST /api/social-accounts/connect-app-password`
 *
 * The body is an open credential bag: `provider` plus whatever fields that
 * provider needs. `catchall(z.string())` keeps the extra fields while still
 * rejecting non-string values, which the handler assumed but never checked.
 */
export const ConnectAppPasswordSchema = z
  .object({
    provider: z.string().min(1, 'provider is required'),
    handle: z.string().optional(),
    appPassword: z.string().optional(),
  })
  .catchall(z.string())
  .superRefine((value, ctx) => {
    const credentialKeys = Object.keys(value).filter(
      (k) => k !== 'provider' && typeof value[k] === 'string' && value[k].length > 0,
    );
    if (credentialKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one credential value is required',
      });
    }

    if (value.provider === 'bluesky') {
      if (!value.handle) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['handle'],
          message: 'Bluesky requires a handle (e.g. you.bsky.social).',
        });
      }
      if (!value.appPassword || value.appPassword.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['appPassword'],
          message: 'Bluesky requires an app password (min 8 characters).',
        });
      }
    }
  });
export type ConnectAppPasswordRequest = z.infer<typeof ConnectAppPasswordSchema>;

/** `POST /api/social-accounts/disconnect/:platform` */
export const SocialPlatformParamSchema = z.object({
  platform: z.string().min(1, 'platform is required'),
});
export type SocialPlatformParam = z.infer<typeof SocialPlatformParamSchema>;

/** `POST /api/social-accounts/disconnect/:platform` — body is optional. */
export const SocialDisconnectSchema = z.object({
  connectorId: z.string().optional(),
});
export type SocialDisconnectRequest = z.infer<typeof SocialDisconnectSchema>;
