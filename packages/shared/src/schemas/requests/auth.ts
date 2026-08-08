/**
 * Auth request schemas.
 *
 * These live in `@vimo/shared` rather than in the backend so the frontend can
 * validate the same shapes in its forms instead of duplicating the rules and
 * letting them drift.
 */

import { z } from 'zod';

/**
 * A VIMO PIN: 4-8 digits.
 *
 * `z.string()` first is deliberate — a JSON number like `1234` must be
 * rejected with "expected string", not silently coerced. The regex is the same
 * one the routes enforced by hand before validation was centralised.
 */
export const PinSchema = z
  .string({ required_error: 'PIN is required', invalid_type_error: 'PIN must be a string' })
  .regex(/^\d{4,8}$/, 'PIN must be 4-8 digits');

/** `POST /api/auth/setup` — establish the first PIN. */
export const AuthSetupSchema = z.object({
  pin: PinSchema,
});
export type AuthSetupRequest = z.infer<typeof AuthSetupSchema>;

/** `POST /api/auth/verify` — exchange a PIN for a session token. */
export const AuthVerifySchema = z.object({
  pin: PinSchema,
});
export type AuthVerifyRequest = z.infer<typeof AuthVerifySchema>;

/**
 * `POST /api/auth/reset-pin` — set a new PIN.
 *
 * Authorised by either a valid session header or a one-time `code` printed to
 * the server console. The route enforces that one of the two is present; the
 * schema only describes the body.
 */
export const AuthResetPinSchema = z.object({
  pin: PinSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{8}$/, 'Reset code must be 8 digits')
    .optional(),
});
export type AuthResetPinRequest = z.infer<typeof AuthResetPinSchema>;

/** `POST /api/auth/reset-pin/request` — ask the server to print a reset code. */
export const AuthResetPinRequestSchema = z.object({}).passthrough();
export type AuthResetPinRequestRequest = z.infer<typeof AuthResetPinRequestSchema>;

/** `POST /api/auth/renew` — extend the current session. Body is empty; the token is a header. */
export const AuthRenewSchema = z.object({}).passthrough();
export type AuthRenewRequest = z.infer<typeof AuthRenewSchema>;

/** `POST /api/auth/logout` — clear the stored session. Body is empty. */
export const AuthLogoutSchema = z.object({}).passthrough();
export type AuthLogoutRequest = z.infer<typeof AuthLogoutSchema>;
