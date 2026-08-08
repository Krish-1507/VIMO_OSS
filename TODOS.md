# TODO — Higgsfield + Managed/Guided OAuth + Connector Hub Redesign

> Status: **Completed** (verified 2026-08-08). Phases A–D are implemented and
> passing `npx tsc --noEmit` in both packages. The modern Connector Hub lives at
> `/connector-hub` (frontend `ConnectorHubPage`); the legacy `/connectors` route
> redirects there.

## Phase A — OAuth architecture (managed/guided/simplified)

- [x] Discover/update backend OAuth start/callback routes behavior
  - File: `packages/backend/src/routes/oauth.ts`
- [x] Implement provider strategy in `packages/backend/src/lib/oauthManager.ts`
  - [x] `MANAGED_PROVIDERS = ['github','notion','canva']` (embedded credentials)
  - [x] `GUIDED_PROVIDERS = ['instagram_facebook','linkedin','google']` (return `{ needsSetup, setupGuide }`)
  - [x] `SIMPLE_CREDENTIAL_PROVIDERS = ['slack','hubspot','higgsfield']`
- [x] Add GitHub PKCE flow (no client secret)
  - [x] `generateCodeVerifier()` (random 64 chars)
  - [x] `generateCodeChallenge(verifier)` (SHA-256 base64url)
  - [x] Auth URL includes `code_challenge` + `code_challenge_method=S256`
  - [x] Token exchange uses `code_verifier` for GitHub
- [x] Ensure callback route exchanges/validates state + PKCE verifier correctly
- [x] Update connector health behavior
  - File: `packages/backend/src/services/connectorHealthService.ts`
  - [x] MANAGED: refresh when expiry within 7 days
  - [x] GUIDED: notify 30 days before expiry with "Reconnect"

## Phase B — Connector Hub UI redesign (adoption)

- [x] Update `packages/frontend/src/pages/ConnectorsPage.tsx`
  - [x] Remove developer-app setup text for managed/guided/simplified flows
  - [x] Implement new provider-type-driven setup modal UI
  - [x] Remove banned words from user-facing strings:
    - [x] "API key"
    - [x] "client ID"
    - [x] "client secret"
    - [x] "OAuth"
    - [x] "redirect URI"
- [x] Create guided modal UI component
  - File: `packages/frontend/src/components/connectors/GuidedSetupFlow.tsx`
  - [x] Stepper UI + Open links + optional input fields + next/back + step completion UX
  - [x] Instagram/Facebook setup guide step count matches spec
- [x] Add "Getting Started" onboarding card when no connectors exist
- [x] Add ConnectorStatus UI on connected connector cards

## Phase C — Higgsfield (verified)

- [x] Confirm TS builds pass: `npx tsc --noEmit`
- [x] Confirm Higgsfield routes/jobs/styles/video work end-to-end
  - Routes exist: `/api/higgsfield/generate`, `/api/higgsfield/jobs`, `/api/higgsfield/jobs/:jobId/status`, `/api/higgsfield/styles`, `/api/higgsfield/video/:jobId`
- [x] Confirm socket events emitted: `higgsfield:job_started`, `higgsfield:progress`, `higgsfield:complete`
- [x] Confirm AI Video tab wiring and style selector fetches from `/api/higgsfield/styles`

## Gates / Acceptance Criteria

- [x] `npx tsc --noEmit` => zero errors
- [x] Connector Hub shows managed/guided/simplified flows as specified
- [x] Zero instances of banned words in ConnectorHub-related UI strings (enforced by `scripts/check-banned-words.mjs` in CI)

## Phase D — Connector Hub: search/filters, multi-account, visual builder, plugin API (Completed)

- [x] Backend `/api/connectors/presets` accepts `search` / `category` / `status` query filters
- [x] Backend `/api/connectors/grouped` returns connectors grouped by provider (multi-account)
- [x] Backend `POST /api/connectors/builder` creates a connector from a visual spec + persists a custom preset
- [x] Backend `GET /api/connectors/custom-presets` lists user-built connectors
- [x] Plugin API (`packages/backend/src/routes/plugins.ts`): `GET /api/plugins`, `POST /api/plugins/register`, `PUT /api/plugins/:id`, `DELETE /api/plugins/:id`, `POST /api/plugins/:id/install`
- [x] Frontend: search box + category/status filters on the Add New tab
- [x] Frontend: multi-account grouping in the Connected tab with "Add another account"
- [x] Frontend: "Build a connector" button → `VisualConnectorBuilder` modal
- [x] Frontend: "Plugins" tab to register / install / delete plugins
