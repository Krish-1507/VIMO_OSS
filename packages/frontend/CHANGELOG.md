# @vimo/frontend

## 1.2.5

### Patch Changes

- 242620b: Fix website DNA analysis end-to-end and apply the design-taste pass.

  - **Backend**: website crawler speaks with a browser User-Agent, retries https/http/www variants, and fails with typed reasons (blocked/not_found/timeout/unreachable/bad_url) so the UI can guide instead of dead-ending; analyze-dna surfaces those reasons; approval tests mock the platform boundary and carry realistic timeouts.
  - **Frontend**: DNA analysis gets a 90s budget, staged progress, and a blocked-site recovery panel that carries the URL into manual mode (Settings + onboarding); single teal accent lock across assistant/onboarding/DNA; copy de-slopped; Settings icons replace emojis; key headlines tightened.

## 1.2.4

### Patch Changes

- fa6a9ef: Simpler product, honester hosting: Team and Desktop Notifications removed, model routing fully unified, studios brand-aware, VPS deploy documented.

  - **Backend**: retired the dead `modelAssignments` blob from routing (Settings per-task picks now drive everything; blob endpoints kept as deprecated); new side-effect-free `POST /api/media/enhance-prompt`; Higgsfield prompts brand-directed; `CORS_ORIGINS` allowlists public domains; Team endpoints removed.
  - **Frontend**: local Ollama models selectable in Add AI Provider; Team tab and Desktop Notifications removed; profile saves debounced; studios style visuals with brand DNA; audit table + toasts + sidebar brand switcher mobile fixes.
  - **Ship**: DEPLOY.md (launcher/systemd/Caddy + Compose + backups), hardened compose, nightly Docker build smoke, `vimo --host`, fixed Docker workspace manifests.

## 1.2.3

### Patch Changes

- 3a19663: Agent skills + learning, parallel campaign sprints, CMO playbooks, and brand-styled visuals.

  - **Backend**: five shipped skill playbooks with a zero-dependency loader (bundled into dist) plus `list_skills` / `use_skill` / `save_lesson` agent tools so VIMO learns with you; `start_sprint` fans trend/competitor/opportunity specialists out in parallel and returns drafts (never publishes); eleven 2026-grounded CMO playbooks guide the Director and answer via `get_playbook`; image generation enriches prompts with brand DNA, craft direction, anti-slop negatives, and platform sizing; assistant legacy path sets brand context (plus a fixed infinite-recursion fallback).
  - **Docs**: README rewritten in plain language with a 5-minute quick start.

- 8c81cbd: Fix the guided OAuth setup trapping users on step 1: the footer showed a disabled "Save & Connect" on every step (instead of "Next Step") because the visibility check looked at all steps instead of the current one. Save now exists only on the final step, credential placeholders are never shown as copyable values, PKCE providers no longer ask for a secret they don't need, and pasted values are trimmed before saving.
- 1edf2fc: Unify model switching so Settings picks actually drive the agents, remove Team + Desktop Notifications, and make VPS hosting OpenClaw-simple.

  - **Backend**: `getModelForTask` now honors the Settings per-task picks (legacy blob → UI `model_<task>` keys → capability auto-assign) instead of silently ignoring them; background task names alias to UI picks in the provider chain; attention alerts route social logins to Social Accounts; `CORS_ORIGINS` allowlists public domains; Team endpoints removed.
  - **Frontend**: local Ollama models are selectable in Add AI Provider (no more hardcoded `llama3` assumption); profile saves are debounced with save feedback plus an email sanity hint; Team tab and Desktop Notifications removed; audit table scrolls with an empty state; toasts fit small phones; brand switcher in the sidebar.
  - **Ship**: `DEPLOY.md` (launcher + systemd + Caddy, Docker Compose, backups, troubleshooting), hardened compose (required key, parameterized URLs), nightly Docker build smoke, `vimo --host` flag, documented `.env` additions.

## 1.2.2

### Patch Changes

- 86eaf6e: Reliability + performance pass: Director runs are observable, the bundle is split, mobile is fixed, and connections stay alive.

  - **Backend**: Director sessions persist a `running` row up front and end `completed`/`failed` (new `status` column + backfill); keyless mode excludes the dead built-in free tier from the provider chain so pipelines hit instant fallbacks instead of hanging; OAuth callbacks adopt handshake credentials onto the real connector row; attention alerts carry provider/kind for smart routing.
  - **Frontend**: route-level code-splitting (124KB shell, per-page chunks, shared vendors) plus a tree-shakeable icon map (ConnectorHub 849KB → 139KB); health dashboard uses the session+CSRF client so Reconnect works; alert banners deep-link social logins to Social Accounts; audit table scrolls with an empty state; toasts fit small phones; brand switcher in the sidebar.
  - **Docs**: README, GET_STARTED, and CONNECTORS_VERIFICATION updated (241 tests / 31 files, new guarantees, agent front door).

- f0306ee: Make the conversational Marketing Agent the front door and fix onboarding end-to-end.

  - **Backend**: the assistant now acts on the ACTIVE brand (explicit choice → Default Brand setting → first brand) instead of always the first row, on both `/api/assistant/chat` and the legacy `/message` endpoint.
  - **Frontend**: chat requests send the active brand id from the header picker.
  - **Onboarding actually finishes**: the completion screen persists `complete-step('complete')` server-side (previously the wizard reappeared on every reload), shows LIVE status instead of hardcoded checkmarks with one-click fix CTAs, and offers "Meet your marketing agent" which opens the assistant on arrival.
  - **Social connect rewritten** on the polling connection service — no more postMessage handshake that silently dropped successes, no timer leaks, honest routing for app-password platforms, cleanup on unmount. Brand setup gains a "Skip for now" escape hatch.
  - **Agent discoverability**: dashboard "Don't click around — just tell VIMO" hero with one-click prompt chips, an "Ask VIMO ⌘K" sidebar entry, first-visit auto-open, and the previously dead InteractiveTour now shows once.

## 1.2.1

### Patch Changes

- b24e8f3: Fix the post-login glitch, harden Social Accounts + Pack Marketplace connections, and polish Settings.

  - **Auth**: `hasPassedSystemCheck` is now reactive (storage + in-app event), the loading gate no longer flashes the wrong route, `isSetupComplete` syncs immediately after PIN setup/verify, and Login/Setup wait for the store before navigating to `/dashboard`.
  - **Session renewal** uses the shared axios instance (correct baseURL/proxy + CSRF) and re-syncs the socket and auth store instead of forcing a hard reload.
  - **Social Accounts**: OAuth popups no longer leak timers (single finalize channel, blocked-popup fast-fail, 5-minute expiry, 410 handling); Bluesky validates handle + app password up front with plain-English errors; cancelled authorizations show a helpful hint instead of a stuck spinner.
  - **Pack Marketplace**: installed state reconciles `/api/connectors` + `/api/packs/installed` + social status; OAuth packs skip empty credential payloads; uninstall is optimistic with revert on real failure.
  - **Settings**: new hero header with live counts + save indicator, pill nav on mobile, and debounced auto-save so typing never floods the API.

## 1.2.0

### Minor Changes

- de6bdce: The VIMO Assistant is now a real agent panel — Cursor for marketing.

  **Frontend**

  - The assistant opens as a docked side panel that PUSHES the app content aside (VS Code / Cursor style) instead of floating over it. Full-screen sheet on mobile, drag-to-resize width on desktop, Esc / Ctrl+K to toggle.
  - Live streaming: responses appear token-by-token over Socket.IO with a typing cursor.
  - Visible tool activity: every tool the agent runs shows as a live row (spinner → ✓/✗ with a summary, expandable args), so you always see what VIMO is doing.
  - Markdown rendering (headings, lists, bold, code, links) via a tiny dependency-free renderer; copy button on every answer; Stop button that aborts the run server-side; new-conversation button; smarter composer (auto-grow, Shift+Enter).

  **Backend**

  - New `POST /api/assistant/chat` kicks off an agentic run and streams progress (`delta` / `tool_start` / `tool_result` / `done` / `error`) over `assistant:event`; `POST /api/assistant/stop` aborts it. Legacy `/message` endpoint unchanged.
  - Agent loop deepened to 14 steps; all 31 tools now operate on the ACTIVE brand instead of the first row.
  - Fixed a product-wide LLM blocker: @ai-sdk provider packages were v3-spec while the app runs ai@4 — every cloud LLM call was failing silently. Pinned to spec-v1 providers.
  - Pollinations anonymous tier no longer supports SSE and its free budget is effectively gone: the built-in provider now runs non-streaming behind the scenes, empty responses are treated as failures, and users get clear one-minute fixes (one-click Ollama local AI, or a free Groq/Google key).

## 1.1.0

### Minor Changes

- eb99a07: Phase 1 — make VIMO usable by a non-technical person.

  - **One-command start** — new `packages/cli` package with a `vimo` binary. `npm i -g vimo` then
    `vimo` clones/installs/starts the app and opens the browser (no technical setup). First run
    downloads VIMO to `~/.vimo`; `--repo`, `--port`, `--no-open`, `--reset`, `--version`, `--help`
    supported. Root `npm run vimo` runs it from a checkout too.
  - **Local AI auto-detect + one-click setup** — new `GET /api/connectors/ollama/status` pings a
    local Ollama install (1.5s timeout, auth-free for onboarding) and returns its model list with a
    sensible default model. Onboarding now shows a "Found a free AI on this computer" card:
    one click connects, tests, and moves on — or links to the Ollama installer and re-checks when
    offline. The connector test endpoint now verifies Ollama honestly (pings the server instead of
    requiring a key) and fails with a plain-English message when it's not running.
  - **Working getting-started checklist** — the first step pointed at a `/brand` route that didn't
    exist (404). New `BrandPage` reuses the brand-setup form and the route is registered, so all
    three checklist steps now land on working pages.
  - **Plain-English sweep** — onboarding AI copy ("AI provider" → "uses AI to write your content",
    "Enter your API key below" → "Paste your key below"), the key-getting modal title, and a
    technical toast in Video Studio ("Job <id>... queued" → plain wording) rewritten for
    non-technical users.

- bdd13ed: Phase 2 — autonomy guardrails, real YouTube/TikTok/Pinterest publishing, multi-account targeting, webhooks.

  - **YouTube / TikTok / Pinterest now publish for real** — replaced the "connect-only"
    stubs with real handlers (`services/platformPublishers.ts`): YouTube resumable
    upload, TikTok Content Posting API (init + status polling, SELF_ONLY privacy by
    default), Pinterest v5 (board resolution + pin creation). All three are now
    marked `ready` in the connector presets. Errors map to plain-English messages —
    no token/API details ever leak to the UI.
  - **Pick which account publishes** — `scheduled_posts.social_account_id` (migration 003) lets a post target a specific connected account per platform. The schedule
    modal shows a "Publish as" dropdown (Auto = first connected account).
  - **Autopilot guardrails** — new `max_posts_per_day` and `spend_cap_per_day`
    session fields (migration 003). The scheduler never assigns more than
    `max_posts_per_day` posts to a single day (shifts to the next day), and content
    creation pauses once the daily AI spend cap is reached. Autopilot LLM usage is
    now attributed per session (`llm_usage.related_entity_id`).
  - **Run next week now** — `POST /api/autopilot/:id/run-now` runs one content
    cycle for the next week on an active session, honoring both guardrails. The
    Autopilot page shows a "Run next week now" button while monitoring.
  - **Embeddings** — `llmProvider.embedText` (Ollama native + OpenAI-compatible
    fallback) and a real `llm_embed` handler so the declared LLM tools actually work
    through the tool router (`llm_complete` + `llm_embed` now registered).
  - **Webhooks** — `POST /api/webhooks/config`, `GET /api/webhooks/events`,
    `POST /api/webhooks/fire-test`, and a receiving endpoint. `post_published` and
    `post_failed` events fire from the scheduler; delivery history is stored in
    `webhook_events`. Settings → Notifications gains a Webhooks card (URL, optional
    HMAC-SHA256 secret, test button, delivery history).

### Patch Changes

- 151aef8: Harden the Pack Marketplace and Social Accounts connector layer for production.

  **Pack install / uninstall**

  - `POST /api/packs/install` is now **idempotent** — re-installing the same pack returns
    `200` with `alreadyInstalled: true` instead of creating a duplicate row.
  - The install payload is validated up front: non-object `config`, non-array
    `discoveryItems`, and missing `packId` / `packName` / `category` return `400` with a
    clear error instead of being persisted as broken JSON.
  - The pack record now persists the connector `provider` so the uninstall path can
    reliably find and tear down the right connectors.
  - `DELETE /api/packs/uninstall` is **atomic** — it removes the pack row and tears down
    the underlying connectors (credentials + MCP server sockets) in one shot, so we never
    leak orphaned rows.
  - Uninstalling a pack that isn't installed returns `404` with a clear error, not a
    silent `200` no-op.

  **Social Accounts**

  - `POST /api/social-accounts/disconnect/:platform` is honest: a non-existent
    `connectorId` returns `404`; an empty platform returns `200` with `disconnected: 0`
    (no more `500` lies). The connector's MCP server is closed before the row is
    removed.
  - `GET /api/social-accounts/oauth-status/:id` returns `410 Gone` for connectors that
    have been cleaned up, so the OAuth popup can give up cleanly.
  - Bluesky (app-password) validates inputs up front — short app passwords or a missing
    handle are clean `400`s, not a half-written connector.
  - The status endpoint runs a background sweep that reaps abandoned OAuth handshakes
    (inactive social connectors older than 15 minutes) so the Connector Hub doesn't
    accumulate "inactive" rows from users who closed the popup.

  **Frontend**

  - The OAuth popup flow (`vimoSocialService.openOAuthPopup`) now uses a single
    `finalize` channel so every `setInterval` is cleared exactly once — no more leaked
    timers on cancel/retry.
  - `disconnectAccount` re-pulls state from the backend so the UI can't drift out of
    sync after a disconnect.
  - `ConnectorHubPage` now sends the connector `provider` in the install payload and
    relies on the backend's atomic uninstall instead of deleting connectors from the
    client.

  **Tests**

  - New `connectorsMarketplaceRoutes.test.ts` (26 tests) mounts the real route handlers
    on a real Fastify app, exercises them over HTTP with a real session token + CSRF
    token, and asserts every behaviour above. The only mocked boundary is `axios`.
  - Backend suite: **100/100 passing** across 13 files. Frontend: **9/9 passing**.

- 4d1a3cc: Cost + performance polish, and kill the "managed provider" friction for X and LinkedIn.

  - **LLM call cache** — repeated Director calls over the same brand context are now
    memoized (`lib/llmCache.ts` → `cachedLLMText`), keyed by task + prompt + brand id.
    Same prompt in the same run (or within a 1h TTL) is served from cache — cheaper and faster.
  - **Structured logging** — replaced scattered `console.warn`/`console.log`/`console.error`
    in the LLM router, pack integrations, pack insights, connector-health, and social-publish
    OAuth enrichment with a structured `lib/logger.ts` (JSON when piped, friendly when TTY).
    Contributors debugging their own Pack can now grep/filter logs.
  - **One-click X + LinkedIn** — reclassified LinkedIn and X as MANAGED OAuth providers
    (alongside GitHub/Notion/Canva). They now use the one-click connect flow (zero keys to
    paste) when `VIMO_LINKEDIN_CLIENT_ID`/`VIMO_LINKEDIN_CLIENT_SECRET` and `VIMO_X_CLIENT_ID`
    are set; otherwise the in-app guided setup still appears.

- c6f214b: Phase 0 ship blockers — security and production-hardening pass.

  **Auth & crypto**

  - PINs are now stored as bcrypt hashes (cost 10) instead of an unsalted SHA-256. Existing installs transparently upgrade on next successful login.
  - `ENCRYPTION_KEY` is validated at boot. Production refuses to start on a weak/placeholder/missing key. Development auto-heals only when no credentials are stored yet, so it can never orphan real secrets. `.env.example`'s placeholder is now recognised.
  - Session expiry is parsed safely: a malformed expiry can no longer produce an immortal session (the NaN-bypass is closed at two layers).
  - `POST /api/auth/reset-pin` now requires a valid session **or** a one-time code printed to the server terminal and saved next to the DB. The code is single-use, expires in 10 minutes, and is never returned in the HTTP response.
  - Every `/api/auth/*` route now has a tight per-route rate limit (verify is 10/min) instead of being allowlisted from throttling.

  **Request validation**

  - A shared `parseBody`/`parseQuery`/`parseParams` Zod helper plus `@vimo/shared` request schemas now guard all 21 state-changing auth/connector/pack/social routes. Malformed bodies return `400 ValidationError` at the edge instead of `500` deep in business logic.
  - Backend imports shared code via relative paths so the production build (`dist/backend`) loads under plain `node` — the `@shared` alias is frontend-only and was a `MODULE_NOT_FOUND` trap in `npm start`.

  **Code hygiene & CI**

  - 140 silent `catch {}` blocks converted to logged warnings; `scripts/check-silent-catch.mjs` fails CI if any return.
  - CI consolidated to a single `verify` job (typecheck + build + banned-words + silent-catches); Playwright browser downloads are cached. A nightly workflow boots VIMO and runs tests on Windows/macOS/Linux.
  - Repo housekeeping: merged duplicate Canva routes, fixed `@shared` Vite alias (documented), repaired `CODEOWNERS`, replaced placeholder `yourusername/vimo` URLs, seeded `CHANGELOG.md`, removed ad-hoc root `*.py` scripts, added a first-time-contributor welcome workflow.

- 4d1a3cc: Add automated release engineering: Changesets now drive versioning and the
  changelog, so package versions are never bumped by hand. CI now builds the
  app (`tsc` + `vite build`) instead of only type-checking, so a green pipeline
  means the app actually compiles and bundles.
