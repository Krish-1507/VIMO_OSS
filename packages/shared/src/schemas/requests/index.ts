/**
 * Request schemas — the validation boundary for state-changing HTTP routes.
 *
 * These describe what a *client sends*, as opposed to the entity schemas in
 * `../index.ts`, which describe what VIMO *stores*. They live in `@vimo/shared`
 * so the frontend can validate its forms against the same rules the backend
 * enforces, and so Phase 2 can generate an OpenAPI document from one registry
 * instead of hand-maintaining a second copy.
 */

export * from './auth';
export * from './connectors';
export * from './packs';
export * from './socialAccounts';
