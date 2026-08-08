# Integration Engine — Status

> Status: **Completed** (verified 2026-08-08). The Connector Hub ships at
> `/connector-hub`; the MCP layer is an internal backend detail only and the
> term "MCP" is banned from user-facing UI (enforced by `scripts/check-banned-words.mjs`).

## Current Goal

Build VIMO's **Integrations** system (under the hood uses MCP) with secure, non-technical UX.

## Progress (Phased)

### Phase 1 — Backend Foundation (Completed)

- [x] 1. Add built-in Integrations Catalog (`packages/backend/src/connectors/presets/index.ts` — provider presets with managed/guided/simple credential types)
- [x] 2. Implement Integration Engine lifecycle (connect/list/actions/invoke/disconnect + retries/backoff/health)
  - Connector create/test/update/delete routes in `routes/connectors.ts`
  - Connector health cron (`connectorHealthService.ts`) — auto-refresh managed tokens, notify on guided-token expiry
- [x] 3. Add DB persistence: encrypted config/credentials (AES-256-GCM credential store) + connector rows
- [x] 4. Implement REST API `/api/connectors/*`
- [x] 5. Add local OAuth callback endpoint `/api/oauth/callback` (state + PKCE validation; `oauthManager.ts`)

### Phase 2 — Frontend Integrations UX (Completed)

- [x] Connector Hub page + pack marketplace + guided setup flows (`/connector-hub`)
- [x] `/connectors` legacy route redirects to `/connector-hub`

### Phase 3 — AI Designer End-to-End (Completed)

- [x] Higgsfield video generation flow: routes, jobs, styles, progress socket events, studio UI

### Phase 4 — Tests & Docs

- [x] Unit tests (frontend component tests, backend service tests)
- [x] Internal contributor docs (MCP terminology internal-only)

## Notes

- User-facing UI must **never** show the term "MCP". Use **Integrations** / **Connections** / **Actions** / **Data**.
- Enforced automatically: `scripts/check-banned-words.mjs` fails CI if banned words appear in user-facing strings.
