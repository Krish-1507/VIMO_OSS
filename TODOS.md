# TODO — Higgsfield + Managed/Guided OAuth + Connector Hub Redesign

## Phase A — OAuth architecture (managed/guided/simplified)

- [ ] Discover/update backend OAuth start/callback routes behavior
  - File: `packages/backend/src/routes/oauth.ts`
- [ ] Implement provider strategy in `packages/backend/src/lib/oauthManager.ts`
  - [ ] `MANAGED_PROVIDERS = ['github','notion','canva']` (embedded credentials)
  - [ ] `GUIDED_PROVIDERS = ['instagram_facebook','linkedin','google']` (return `{ needsSetup, setupGuide }`)
  - [ ] `SIMPLE_CREDENTIAL_PROVIDERS = ['slack','hubspot','higgsfield']`
- [ ] Add GitHub PKCE flow (no client secret)
  - [ ] `generateCodeVerifier()` (random 64 chars)
  - [ ] `generateCodeChallenge(verifier)` (SHA-256 base64url)
  - [ ] Auth URL includes `code_challenge` + `code_challenge_method=S256`
  - [ ] Token exchange uses `code_verifier` for GitHub
- [ ] Ensure callback route exchanges/validates state + PKCE verifier correctly
- [ ] Update connector health behavior
  - File: `packages/backend/src/services/connectorHealthService.ts`
  - [ ] MANAGED: refresh when expiry within 7 days
  - [ ] GUIDED: notify 30 days before expiry with “Reconnect”

## Phase B — Connector Hub UI redesign (adoption)

- [ ] Update `packages/frontend/src/pages/ConnectorsPage.tsx`
  - [ ] Remove developer-app setup text for managed/guided/simplified flows
  - [ ] Implement new provider-type-driven setup modal UI
  - [ ] Remove banned words from user-facing strings:
    - [ ] "API key"
    - [ ] "client ID"
    - [ ] "client secret"
    - [ ] "OAuth"
    - [ ] "redirect URI"
- [ ] Create guided modal UI component
  - File: `packages/frontend/src/components/connectors/GuidedSetupFlow.tsx` (create directory if missing)
  - [ ] Stepper UI + Open links + optional input fields + next/back + step completion UX
  - [ ] Instagram/Facebook setup guide step count matches spec
- [ ] Add “Getting Started” onboarding card when no connectors exist
- [ ] Add ConnectorStatus UI on connected connector cards

## Phase C — Higgsfield (existing partial work to verify)

- [ ] Confirm TS builds pass: `npx tsc --noEmit`
- [ ] Confirm Higgsfield routes/jobs/styles/video work end-to-end
- [ ] Confirm socket events emitted: `higgsfield:job_started`, `higgsfield:progress`, `higgsfield:complete`
- [ ] Confirm AI Video tab wiring and style selector fetches from `/api/higgsfield/styles`

## Gates / Acceptance Criteria

- [ ] `npx tsc --noEmit` => zero errors
- [ ] Connector Hub shows managed/guided/simplified flows as specified
- [ ] Zero instances of banned words in ConnectorHub-related UI strings

## Phase D — Connector Hub: search/filters, multi-account, visual builder, plugin API (COMPLETED)

- [x] Backend `/api/connectors/presets` accepts `search` / `category` / `status` query filters
- [x] Backend `/api/connectors/grouped` returns connectors grouped by provider (multi-account)
- [x] Backend `POST /api/connectors/builder` creates a connector from a visual spec + persists a custom preset
- [x] Backend `GET /api/connectors/custom-presets` lists user-built connectors
- [x] Plugin API (`packages/backend/src/routes/plugins.ts`): `GET /api/plugins`, `POST /api/plugins/register`, `PUT /api/plugins/:id`, `DELETE /api/plugins/:id`, `POST /api/plugins/:id/install`
- [x] Frontend: search box + category/status filters on the Add New tab
- [x] Frontend: multi-account grouping in the Connected tab with "Add another account"
- [x] Frontend: "Build a connector" button → `VisualConnectorBuilder` modal
- [x] Frontend: "Plugins" tab to register / install / delete plugins
