/**
 * Connector request schemas.
 *
 * Field names and optionality mirror what the handlers in
 * `backend/src/routes/connectors.ts` actually read, and what
 * `backend/src/db/schema.ts` accepts. Nothing here is stricter than the
 * behaviour that shipped — the goal is to reject malformed input at the edge,
 * not to change the contract.
 */

import { z } from 'zod';
import { VIMO_CONNECTOR_TYPES } from '../connectorTypes';

/** Connector ids are opaque strings (`conn_instagram_ab12cd`), not UUIDs. */
export const ConnectorIdParamSchema = z.object({
  id: z.string().min(1, 'Connector id is required'),
});
export type ConnectorIdParam = z.infer<typeof ConnectorIdParamSchema>;

/**
 * A credential bag. Values are secrets — never log a parsed result of this.
 * Empty strings are allowed because the UI submits blank optional fields.
 */
export const CredentialsSchema = z.record(z.string());

export const ConnectorTypeSchema = z.enum(
  VIMO_CONNECTOR_TYPES as unknown as [string, ...string[]],
);

export const ConnectorStatusSchema = z.enum(['active', 'inactive', 'error', 'rate_limited']);

/** `POST /api/connectors` */
export const CreateConnectorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: ConnectorTypeSchema,
  provider: z.string().min(1, 'Provider is required'),
  status: ConnectorStatusSchema.optional(),
  config: z.record(z.unknown()).optional(),
  credentials: CredentialsSchema.optional(),
});
export type CreateConnectorRequest = z.infer<typeof CreateConnectorSchema>;

/** `PUT /api/connectors/:id` — every field optional; this is a partial update. */
export const UpdateConnectorSchema = z.object({
  name: z.string().min(1).optional(),
  type: ConnectorTypeSchema.optional(),
  provider: z.string().min(1).optional(),
  status: ConnectorStatusSchema.optional(),
  config: z.record(z.unknown()).optional(),
  credentials: CredentialsSchema.optional(),
});
export type UpdateConnectorRequest = z.infer<typeof UpdateConnectorSchema>;

/** One credential field described by the no-code connector builder. */
export const RequiredCredentialSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  isSecret: z.boolean().optional(),
});

/** One tool exposed by a builder-defined connector. */
export const ConnectorToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
});

/** `POST /api/connectors/builder` */
export const ConnectorBuilderSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.string().min(1, 'Provider is required'),
  type: ConnectorTypeSchema.optional(),
  authType: z.enum(['api_key', 'oauth2', 'oauth2_manual', 'app_password', 'none']).optional(),
  accountLabel: z.string().optional(),
  iconSlug: z.string().optional(),
  description: z.string().optional(),
  requiredCredentials: z.array(RequiredCredentialSchema).optional(),
  tools: z.array(ConnectorToolSchema).optional(),
  config: z.record(z.unknown()).optional(),
});
export type ConnectorBuilderRequest = z.infer<typeof ConnectorBuilderSchema>;

/**
 * `POST /api/connectors/test-credentials`
 *
 * `credentials` stays optional: OAuth-style providers are legitimately tested
 * with an empty bag, which the handler treats as "verify on connect".
 */
export const TestCredentialsSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  credentials: CredentialsSchema.optional(),
});
export type TestCredentialsRequest = z.infer<typeof TestCredentialsSchema>;

/** `POST /api/connectors/mcp/connect` */
export const McpConnectSchema = z.object({
  serverUrl: z.string().min(1, 'serverUrl is required').url('serverUrl must be a valid URL'),
  connectorId: z.string().min(1, 'connectorId is required'),
});
export type McpConnectRequest = z.infer<typeof McpConnectSchema>;

/** `POST /api/connections/:platform/reconnect` */
export const PlatformParamSchema = z.object({
  platform: z.string().min(1, 'Platform is required'),
});
export type PlatformParam = z.infer<typeof PlatformParamSchema>;
