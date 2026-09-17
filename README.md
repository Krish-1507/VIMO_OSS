<p align="center">
  <img src="VIMO_logo.png" alt="VIMO — Vibe Marketing Operations" width="220">
</p>

# VIMO — Vibe Marketing Operations

[![CI](https://github.com/Krish-1507/VIMO_OSS/actions/workflows/ci.yml/badge.svg)](https://github.com/Krish-1507/VIMO_OSS/actions/workflows/ci.yml)
[![Nightly cross-platform smoke](https://github.com/Krish-1507/VIMO_OSS/actions/workflows/nightly.yml/badge.svg)](https://github.com/Krish-1507/VIMO_OSS/actions/workflows/nightly.yml)

**Your AI marketing team in a chat box.** Tell VIMO what you want in plain words —
it researches, writes, designs, schedules, posts, replies, and learns what works
for *your* brand. Free, open-source, and running on your own machine.

> Type one sentence. VIMO handles the rest.

## 📚 Start here

- **[Get Started — no keys needed](GET_STARTED.md)** — see it working in 2 minutes (try the Demo first, connect later).
- **[Deploy it anywhere](DEPLOY.md)** — your laptop, a $5 VPS with HTTPS, or Docker. Backups and updates included.
- **[Connector & Marketplace Verification](docs/CONNECTORS_VERIFICATION.md)** — the proof that install/uninstall/connect/disconnect actually work (manual + automated).
- **[Extending VIMO](docs/EXTENDING_VIMO.md)** — add your own connector or Pack in ~50 lines.
- **[Contributing](CONTRIBUTING.md)** · **[Security](SECURITY.md)** · **[Roadmap](ROADMAP.md)** · **[Code of Conduct](CODE_OF_CONDUCT.md)**
- **[GitHub Discussions](https://github.com/Krish-1507/VIMO_OSS/discussions)** — questions, ideas, roadmap input.
- **[Releases](https://github.com/Krish-1507/VIMO_OSS/releases)** — what changed, automatically documented.

---

## Why VIMO exists

Most "AI marketing" tools assume you speak fluent API: create a developer app,
generate a secret, paste a token, configure a webhook, pray nothing breaks.

VIMO is built for everyone else:

- **Talk, don't configure.** Open the assistant (`Cmd/Ctrl + K`) and type what
  you want: *"grow my Instagram"*, *"write this week's posts"*. VIMO does the
  clicking, writing, and scheduling across 30+ tools — and shows its work.
- **Connect without the homework.** GitHub connects in one click; everything
  else is a guided, step-by-step setup in plain words. No developer portals
  unless a platform forces it (and then VIMO walks you through it).
- **You stay in control.** Nothing goes live without your approval unless you
  switch on Autonomous Mode. One approval queue, skimmable in seconds.
- **It explains itself.** Every suggestion shows its data and confidence.
- **It learns your brand.** Your colors, voice, audience, and every lesson
  from every post become your brand's memory — so output stops looking like
  generic AI slop and starts looking like *you*.

If you can write a tweet, you can run your own marketing team.

---

## 🛡️ Hardened for production — what this release guarantees

This release explicitly bulletproofs the two surfaces that get touched the most: **Pack
Marketplace** (install / uninstall) and **Social Accounts** (OAuth, app passwords,
disconnect). If you only have two minutes, here is what changed and what is now enforced
by an automated test:

- **Pack install is idempotent.** Re-installing the same pack no longer creates a
  duplicate row — it returns `200` with `alreadyInstalled: true`.
- **Pack uninstall is atomic.** Uninstalling a pack always tears down its underlying
  connectors (credentials + MCP server sockets) too, so we never leak orphaned rows.
- **Bad payloads are rejected with honest 400s** — non-object `config`, non-array
  `discoveryItems`, missing `packId` — instead of corrupting the database.
- **Disconnecting a non-existent social account returns `404`**, not `200`-and-lie.
  Disconnecting a platform with zero connections returns `200` with `disconnected: 0`,
  not `500`.
- **OAuth popups no longer leak timers.** The `openOAuthPopup` flow uses a single
  `finalize` channel so every interval is cleared exactly once, no matter which path
  (poll success, popup-closed, grace-timeout) wins the race.
- **Bluesky (app-password) validates inputs up front** — a short app password or
  missing handle is a clean `400`, not a half-written connector.
- **Abandoned OAuth handshakes are reaped** after 15 minutes so the Connector Hub
  doesn't accumulate "inactive" rows from users who closed the popup.
- **OAuth tokens land on the real connector.** Pack flows handshake under a synthetic
  id; the callback now adopts those credentials onto the created row (and enriches
  it) instead of leaving a "connected" row with no tokens behind.
- **Connections self-heal and reconnect in one click.** Hourly health checks refresh
  expiring OAuth tokens, warn before guided-provider tokens lapse, and route every
  alert to the right fix screen (Social Accounts vs. Connector Hub).
- **Director runs are observable.** Every run persists a `running` row up front and
  ends in `completed`/`failed` — no more polling a void, and keyless environments
  skip the dead free tier straight to instant fallbacks instead of hanging.
- **CSRF + session enforcement is covered by tests** on every state-changing route
  (`x-session-token` + double-submit `x-csrf-token`).

All of the above is covered by `packages/backend/src/tests/connectorsMarketplaceRoutes.test.ts`
(26 tests, real Fastify app, real DB, mocked HTTP only) plus `oauthCallbackAdoption`,
`assistantBrandResolution`, and `marketingDirector` lifecycle tests. Full breakdown +
copy-paste manual smoke tests live in **[docs/CONNECTORS_VERIFICATION.md](docs/CONNECTORS_VERIFICATION.md)**.

---

## ✨ Features

- **The Marketing Director** — a 24/7 CMO that orchestrates four specialized workers
  (Research, Analytics, Content, Engagement) into a daily morning briefing with prioritized,
  explained actions.
- **Approval Queue** — human-in-the-loop control. Approve, reject, or **batch-approve an entire
  campaign in one click**; pending posts group by campaign in the Approvals UI.
- **Webhooks** — event delivery (post published/failed, test fires) with **HMAC-signed payloads**,
  delivery history, and a **retry queue with exponential backoff**.
- **Brand Brain & Content DNA** — permanent memory of every post, campaign, lesson, and audience
  insight. VIMO evolves its voice automatically.
- **VIMO Assistant** — your conversational marketing operator and the app's front
  door (dashboard hero, sidebar button, `Cmd/Ctrl + K`). It runs 30+ tools, follows
  reusable **skill playbooks** (launch a post, plan pillars, repurpose winners…),
  can fan out a **parallel sprint** of specialists toward one goal, and **saves
  what it learns** about your brand so every run gets smarter. Always acts on
  your active brand.
- **CMO playbooks built in** — proven operator strategies (content pillars with
  ratios, hook-first video, social-search captions, winner-repurpose loops,
  sustainable cadence) guide both the assistant and the Director's
  recommendations — senior-operator thinking, on demand.
- **Brand-styled visuals** — generated images carry your colors, aesthetic, and
  craft direction with anti-slop guardrails, sized per platform. Saved to your
  library as drafts, never auto-posted.
- **Brand Roast** — a brutally honest 0–100 score with specific fixes. Designed to be shared.
- **Marketing Time Machine** — root-cause analysis over 12 weeks of your own data.
- **Content Intelligence** — Reels scripts, three-tier hashtag rotation, growth-optimized posting
  times, content variety system.
- **Growth Loops** — detect a winner, then auto-generate follow-ups, repurposed cross-posts, and
  A/B tests.
- **Explainability** — every suggestion shows the _why_, _data points_, _confidence_, and _method_.
- **Model Router & Cost Transparency** — route tasks to the right model, see real token/cost
  dashboards. ~$5–15/month for a moderately active account.
- **Native Connectors + Pack Marketplace** — a growing catalog of connectors across social,
  intelligence, design, commerce, and analytics. Every connector ships with an honest
  **readiness badge** (`Ready` · `Connect only` · `Coming soon`) so you always know what works
  today vs. what's still being wired (see [Coverage & honest status](#coverage--honest-status)).
- **Real publishing for YouTube, TikTok & Pinterest** — resumable YouTube uploads, TikTok
  Content Posting API, and Pinterest v5 pins, alongside Instagram/Facebook/LinkedIn/X/Threads/
  Reddit/Medium/Bluesky.
- **Multi-account per platform** — connect several Instagram/LinkedIn/X accounts and pick the
  publishing account per post ("Publish as" in the Scheduler).
- **Stay-logged-in browser sessions** — persistent Chromium profiles (one per
  account): log in once in a visible window, the agent reuses that login
  headlessly from then on. Reads are automatic; every click or keystroke needs
  a human-approved approval request. Deleting a session wipes the profile and
  forgets the login.
- **Login-free channel research** — VIMO's internal AgentReach reads subreddits
  + threads, YouTube transcripts, GitHub repos/readmes, RSS feeds, and single X
  posts directly. Login walls fail honestly instead of returning garbage.
- **Autopilot guardrails** — daily post cap + daily AI spend cap, enforced in content generation
  and scheduling, plus "Run next week now."
- **Analytics CSV export** — download post performance for any date range and brand.
- **Email notifications** — dependency-free SMTP client (plain/STARTTLS/implicit TLS) with a
  settings UI and test send.

- **Plugin API** — register third-party connectors with actions and install them as real
  connectors.

---

## 🚀 Up and running in 5 minutes

You don't need a single API key to see VIMO work.

### 1. Start it (pick one)

```bash
npm i -g vimo-oss
vimo
```

That's it — no git, no Docker. It downloads VIMO, sets it up, and opens your
browser (Windows: `vimo` in cmd/PowerShell; macOS/Linux: same). First run takes
a few minutes; later starts are fast. `Ctrl+C` stops everything.

### 2. Look around instantly

On the login screen choose **"Try the Demo"** — a fully-working sample brand
with posts, analytics, and a plan. Clearly labeled, never confused with real data.

### 3. Make it yours (guided, ~3 minutes)

1. **Set a PIN** (4–8 digits — it's your private, single-user app).
2. **Pick your AI brain** — paste one key (OpenAI, Groq, …), use free local AI
   if offered, or skip and add it later in Settings.
3. **Describe your brand** — paste your website and VIMO extracts your identity,
   or fill in three quick fields.
4. **Connect an account** — click a platform, approve in your browser, done.
5. **Meet your agent** — tell it what you want (*"grow my Instagram"*) and
   approve what it proposes.

That's the whole journey: one key, one brand, one account — then VIMO runs
your marketing while you approve.

Handy extras: `vimo doctor` (is my machine ready?), `vimo --update` (updates
everything, keeps your data), `vimo --reset` (fresh start). Version unsure?
Settings → About (app) and `vimo --version` (launcher). Want it online 24/7?
See **[DEPLOY.md](DEPLOY.md)** for the VPS path.

### Run it (developers)

```bash
# 1. Clone
git clone https://github.com/Krish-1507/VIMO_OSS.git
cd vimo

# 2. Install (monorepo: backend + frontend + shared)
npm install

# 3. Configure — copy the template and fill in ONLY what you want to use
cp .env.example .env
#   (an ENCRYPTION_KEY is generated for you on first run if absent)

# 4. Start backend + frontend together
npm run dev
```

Then open **http://localhost:5173**. Prefer one-click launchers? Use `Start VIMO.bat`
(Windows), `Start VIMO.command` (macOS), or `start-vimo.sh` / `docker-compose.yml` (Linux).
No Docker required — everything runs natively with SQLite.

#### Production mode (what the `vimo` command runs)

The launcher never uses dev servers. It builds once and serves everything from a
single port:

```bash
npm run build:app     # build frontend + backend
npm run start:app     # serve app + API on one port (default 3000)
```

The backend serves the built frontend itself (same origin — no CORS, no proxy)
and binds to `127.0.0.1` unless you set `HOST`.

---

## 🏗️ Architecture

VIMO is a typed monorepo with three layers. The key idea: **you don't build agents — you build
workers and connectors, and the Director orchestrates them.**

```mermaid
flowchart TB
  subgraph User["You"]
    U[Browser / VIMO Assistant]
  end

  subgraph Frontend["packages/frontend (React + Vite)"]
    FE[Pages · Stores · Connector Packs]
  end

  subgraph Backend["packages/backend (Fastify + SQLite)"]
    direction TB
    API[REST + WebSocket API]
    subgraph Layers["Three-Layer Engine"]
      SVC[Service Layer<br/>content · analytics · engagement<br/>memory · scheduling · approvals]
      WRK[Worker Layer<br/>research · analytics · content · engagement]
      ORCH[Orchestration Layer<br/>Marketing Director]
    end
    subgraph Conn["Connection Layer"]
      SA[Social Accounts<br/>connect + publish]
      PM[Pack Marketplace<br/>discover · validate · sync]
      INT[Integration Engine<br/>AI Designer / Canva]
    end
    MEM[(SQLite + Drizzle<br/>encrypted credential store)]
  end

  subgraph Ext["External World (mocked in tests)"]
    IG[(Instagram / Meta Graph)]
    GH[(GitHub / Notion / Shopify …)]
    CANVA[(Canva API)]
    LLM[(AI Providers)]
  end

  U --> FE --> API
  API --> SVC --> WRK --> ORCH --> SVC
  ORCH -. "reads/writes" .-> MEM
  SA --> IG
  PM --> GH
  INT --> CANVA
  SVC --> LLM
```

| Layer                   | Responsibility                       | Examples                                                                 |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| **Service Layer**       | Reusable business logic              | content generation, analytics, engagement, memory, scheduling, approvals |
| **Worker Layer**        | Focused functions the Director calls | research, analytics, content, engagement                                 |
| **Orchestration Layer** | Coordinates workers into a briefing  | the Marketing Director                                                   |

---

## 🔌 How Connections Work

This is the part contributors care about most, so we'll be precise. Every external integration
flows through VIMO's **Connection Layer**, and every secret is **encrypted at rest** (AES-256-GCM)
before it touches the database.

### 1. Social Accounts — connect

- **One-click managed providers** (GitHub, Notion, Canva, **LinkedIn**, **X**): VIMO opens the
  provider's OAuth popup, the user approves, and VIMO receives the access + refresh tokens. They are
  encrypted immediately via `credentialStore` and stored in `app_settings` keyed by
  `cred:<connectorId>:<key>`. LinkedIn and X are the platforms people try first, so they're managed
  (zero keys) out of the box when their app credentials are configured.
- **Other platforms**: you paste the key the platform already shows you (VIMO points you to the
  exact settings page). On save, VIMO can run a **live connectivity test** before marking the
  connector active.
- The connector row lives in the `connectors` table; the secret never does.

### 2. Social Accounts — publish

```
VIMO Assistant / Scheduler
   → Publish Service (provider-agnostic router)
      → Native Platform Handler (e.g. instagramHandler)
         → Platform API (e.g. Meta Graph API)
```

The handler does the real work VIMO is responsible for — verifying the account type, creating a
media container, polling until it's ready, publishing, and mapping any API error (expired token,
rate limit, personal account) into a friendly, token-free message. **VIMO's own logic is what we
test** (see `packages/backend/src/tests/connectionSocialAccounts.test.ts`); only the platform API
is mocked.

### 3. Pack Marketplace — discover & validate

A "Pack" turns an external tool (Shopify, GitHub, Stripe, SEO, …) into live context for VIMO.

- **Discover** — `discoverPack(provider, credentials)` makes a _real, minimal_ read-only call to
  the provider (list repos, count products, read balance) and returns honest discovery items. If
  the call fails, it returns `success: false` with the real error — **VIMO never fabricates
  metrics.**
- **Validate** — before a credential-based pack is marked "Connected," VIMO re-runs that same live
  call. A pack is only "Connected" when access genuinely works.
- **Install** — `POST /api/packs/install` is **idempotent** and validates the payload up front
  (rejects non-object `config`, non-array `discoveryItems`, missing `packId` with a `400` instead
  of writing broken JSON to the DB). The pack persists its `provider` so the uninstall path can
  find its connectors.
- **Uninstall** — `DELETE /api/packs/uninstall` is **atomic**: it removes the pack row **and**
  tears down the underlying connectors (credentials + MCP server sockets) in one shot, so we
  never leak orphaned rows. Uninstalling a pack that isn't installed returns `404` instead of a
  silent `200`. See the automated test for the full contract.
- **Sync** — installed packs run through a **`PackAdapter`** that pulls live data, records the sync
  outcome on the connector, and reports connection health.

### 4. AI Designer (Integration Engine)

The AI Designer connects to Canva through the Integration Engine, which wraps the real Canva REST
API using the access token of the Canva connector you already connected. Designs are created in
_your_ Canva account.

> 🔒 **Leakage guarantee:** errors are sanitized before they reach the UI (no tokens, no OAuth
> details), the session token is only ever returned to the verified client, and external API
> boundaries are the _only_ thing our connection-layer tests mock. See [SECURITY.md](SECURITY.md).

---

## 📊 Coverage & honest status

We'd rather under-promise than lose your trust after a star. VIMO ships a large _catalog_ of
connectors, but not every one can publish end-to-end yet. Each connector carries a readiness badge
you can see in the Connector Hub:

| Badge            | Meaning                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Ready**        | You can connect **and** act end-to-end today — publishing, generation, or querying actually works and is covered by our tests. |
| **Connect only** | You can connect and pull context/analytics, but automated publishing for that platform isn't wired up yet. We say so plainly.  |
| **Coming soon**  | Advertised in the catalog, but the connector/adapter hasn't been built.                                                        |

Current reality (no embellishment):

- **Ready** — Instagram, Facebook, LinkedIn, X, Threads, Reddit, Medium, Bluesky, **YouTube**,
  **TikTok**, **Pinterest** (real, tested publish paths); all LLM providers; Canva AI Designer;
  Higgsfield video generation. YouTube uploads are private until you publish them in YouTube
  Studio, and TikTok uploads are created private (SELF_ONLY) — the whitelist/approval flow is
  managed by TikTok.
- **Connect only** — WordPress, Shopify, Mailchimp, Google/Meta Ads, HubSpot, Google Analytics,
  Notion, Slack; and the MCP intelligence sources (GitHub, Notion, Slack, Drive, Linear, Figma,
  Trello, Asana, Dropbox) which feed VIMO context but don't publish on your behalf.

If you want a platform moved from _Connect only_ → _Ready_, the publish handler is the place to
contribute — see `packages/backend/src/services/vimoSocialPublishService.ts`.

---

## 🔒 Security & Secrets

- **Credentials are encrypted at rest** (AES-256-GCM) with a key from your `.env`
  (`ENCRYPTION_KEY`). Decrypted only in memory, only when used.
- **Webhook payloads are HMAC-signed** so any endpoint you wire up can verify VIMO is
  the sender and the payload wasn't tampered with.
- **Local-first.** Single-user, runs on `localhost`. The session token is a random 256-bit value;
  see [SECURITY.md → What we store and why](SECURITY.md) for the full, honest inventory.
- **No telemetry.** VIMO does not phone home.
- **Prompt sanitization** defends against prompt injection from scraped content.
- **Reproducible test boundaries.** Our tests mock the _external API_, never VIMO's logic — so a
  green suite means the real code paths work.

---

## 🧩 Extensibility — write your own connector in ~50 lines

VIMO is designed to be extended by _you_. The `PackAdapter` pattern is intentionally tiny:

- Add a **preset** in `packages/backend/src/connectors/presets/index.ts`.
- Implement a **handler** (for social publishing) or a **PackAdapter** (for the marketplace).
- Register it and open a PR.

A complete, copy-paste walkthrough is in **[docs/EXTENDING_VIMO.md](docs/EXTENDING_VIMO.md)** —
including a 50-line example connector and the discover/validate contract.

---

## 🛠️ Tech Stack

| Layer              | Technology                     |
| ------------------ | ------------------------------ |
| Frontend           | React 18 + TypeScript + Vite   |
| Backend            | Fastify + Node.js + TypeScript |
| Database           | SQLite + Drizzle ORM           |
| Agents             | LangGraph.js + LangChain.js    |
| Real-Time          | Socket.io                      |
| Local Vector Store | LanceDB                        |
| Styling / State    | Tailwind CSS · Zustand         |

**Zero Docker required.** SQLite, an in-memory job-queue fallback, and optional local AI via
Ollama mean VIMO can run entirely offline.

**Fast by default.** Route-level code-splitting keeps first paint to a ~124KB shell
(~36KB gzipped) with per-page chunks; shared vendors (React, charts, network) are cached
across navigations. The UI is responsive down to phones — tables scroll, toasts fit,
and brand switching lives in the sidebar.

---

## 🤝 Contributing

We want this to be _the_ place indie hackers and agencies extend. Start with
**[CONTRIBUTING.md](CONTRIBUTING.md)** — it covers the dev setup, the testing expectations (every
connection change ships with an integration test), and how to add a connector, a Pack, or a worker.
Versions and the changelog are automated via **[Changesets](.changeset/README.md)** — open a PR with
a changeset, never bump a version by hand.

Good first contributions (see the [`good first issue`](https://github.com/Krish-1507/VIMO_OSS/labels/good%20first%20issue) label and the [label legend](CONTRIBUTING.md#label-legend-one-liners)):

- Add a connector preset.
- Add a `PackAdapter` for a new intelligence source.
- Improve error messages (no silent catches).
- **Add tests** for a connection path — confidence is how this project earns its stars.

---

## ✅ Testing & verification

A green test suite is the **single source of truth** for "this works." VIMO mocks the
*external* API (Facebook Graph, Shopify, GitHub, Bluesky, …) and exercises VIMO's own
code end-to-end on every CI run.

```bash
# Run the full test suite (backend + frontend)
npm test

# Backend only — 280 tests across 38 files
npm run test:backend

# Frontend only — 143 tests across 4 files
npm run test:frontend

# End-to-end Playwright smoke (boots the app, runs the Director,
# checks webhooks, approvals, and CSV export)
npm run test:e2e

# Just the connection-layer suite (Pack Marketplace + Social Accounts)
npm run test:backend -- --reporter=verbose src/tests/connectorsMarketplaceRoutes.test.ts
```

What the suite covers:

- `connectorsMarketplaceRoutes.test.ts` — **26 tests** on a real Fastify app, real
  session token + CSRF, real in-memory SQLite, mocked `axios` only. Proves install
  idempotency, uninstall cleanup, disconnect 404s, OAuth-status `410` semantics,
  Bluesky validation, and more.
- `oauthCallbackAdoption.test.ts` — pack OAuth handshakes adopt their tokens onto the
  real connector row (no orphaned credentials, no empty "connected" rows).
- `assistantBrandResolution.test.ts` — the agent resolves explicit choice → Default
  Brand → first brand, with stale ids falling through instead of failing.
- `marketingDirector.test.ts` — the full pipeline persists a `completed` session;
  `runMarketingDirector` writes the `running` row up front.
- `llmBuiltinDisable.test.ts` — keyless mode never attempts the dead free tier.
- `modelAssignmentUnification.test.ts` — Settings model picks drive every agent;
  stale picks fall back honestly; background task names alias to UI picks. The
  retired `modelAssignments` blob no longer drives routing.
- `skills.test.ts` — the shipped skill catalog parses; unknown skills resolve to
  null; lesson persistence matches the schema.
- `marketingSprint.test.ts` — parallel fan-out degrades into warnings, drafts
  still ship, nothing schedules or publishes on its own.
- `cmoCreative.test.ts` — playbook matching (exact → phrase → keywords, null
  otherwise) and brand-DNA visual briefs with safe no-brand passthrough.
- `websiteCrawler.test.ts` — URL variant fallback, typed failure reasons
  (blocked/not_found/timeout/unreachable/bad_url), full analysis shape.
- `approvalService.test.ts` — platform boundary mocked (Meta-style fast
  failure); execute-path tests carry a 20s budget for cold scheduler imports.
- `browserSession.test.ts` — persistent sessions against a fake Chromium
  backend: launch/read/close keeps the profile on disk, cookie-based login
  status, writes create an approval request and execute only after approval.
- `researchChannels.test.ts` — every channel (web extract, Reddit, YouTube,
  GitHub, RSS, X) tested with stubbed fetch: clean LLM-ready text in, honest
  login-wall errors out, zero network.
- `packs.test.ts` (frontend, **134 tests**) — every marketplace pack satisfies
  the setup contract: completable steps with valid payloads, resolving help
  links, rules matching real fields, resolvable icons, in-app routes.
- `connectionPackMarketplace.test.ts` — live `discoverPack` + `PackAdapter` round-trip
  for Shopify, GitHub, Stripe, SEO, … with real DB and credential store.
- `connectionSocialAccounts.test.ts` — Instagram account verification + publish path
  with axios mocked at the Meta Graph boundary.
- `webhookRetries.test.ts` — HMAC signature verification, delivery attempts, and the
  retry queue with exponential backoff.
- `authRateLimit.test.ts` / `authResetPin.test.ts` / `sessionExpiry.test.ts` /
  `sessionEncryption.test.ts` / `pinHashing.test.ts` — the auth gate: per-route rate
  limits, one-time reset codes, encrypted sessions that fail closed on malformed
  expiry, and bcrypt PIN hashing with a legacy upgrade path.
- `e2e/smoke.spec.ts` — a Playwright smoke that boots the real app, performs first-run
  PIN setup, creates a Demo brand, runs the Marketing Director to completion, and
  checks the Phase 3 surface: webhook config round-trip + retry queue, the approval
  queue + campaign batch approval, and the analytics CSV export.

Manual smoke-tests (with copy-pasteable `fetch` snippets) live in
**[docs/CONNECTORS_VERIFICATION.md](docs/CONNECTORS_VERIFICATION.md)**.

---

## 📄 License

VIMO is released under the [MIT License](LICENSE). Built for creators, by creators.

---

<p align="center">
  <b>No agencies. No $4,000 SaaS bills. Just type your goal, click GO, and watch it happen.</b>
</p>
