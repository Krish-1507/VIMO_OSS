# FUTURE IMPROVEMENTS — VIMO Post-Mortem & Roadmap

> This document is a brutally honest review of VIMO from two perspectives:
>
> 1. A senior engineer evaluating production readiness, architecture, and code quality
> 2. A non-technical marketing director evaluating whether this tool actually helps them
>
> Version: 2.0.0 | Date: June 15, 2026

---

## Table of Contents

- [Part I: The Hard Truth (Executive Summary)](#part-i-the-hard-truth-executive-summary)
- [Part II: Senior Engineer Review](#part-ii-senior-engineer-review)
  - [Security — The Scary Parts](#security--the-scary-parts)
  - [Architecture — What Needs Rethinking](#architecture--what-needs-rethinking)
  - [Code Quality — Inconsistencies & Debt](#code-quality--inconsistencies--debt)
  - [Testing — The Silent Crisis](#testing--the-silent-crisis)
  - [Performance & Scalability](#performance--scalability)
- [Part III: Non-Technical User Review](#part-iii-non-technical-user-review)
  - [First Impression — Why Would I Use This?](#first-impression--why-would-i-use-this)
  - [Onboarding — The Wall of Hurdles](#onboarding--the-wall-of-hurdles)
  - [Daily Use — What Actually Works](#daily-use--what-actually-works)
  - [The Trust Problem](#the-trust-problem)
- [Part IV: Prioritized Improvement Roadmap](#part-iv-prioritized-improvement-roadmap)
- [Part V: Long-Term Vision](#part-v-long-term-vision)

---

## Part I: The Hard Truth (Executive Summary)

VIMO is an ambitious project that tries to be **10 things at once** — social media manager, content creator, analytics platform, trend spotter, competitor tracker, AI assistant, campaign scheduler, approval system, brand roaster, and viral video maker. The ambition is admirable, but the execution needs focus.

**For an engineer:** This is a solid proof-of-concept that is 6-12 months of disciplined work away from being production-ready. The core architecture (Fastify + React + SQLite) is sensible for a v1, but there are gaping security holes, zero test coverage, and architectural decisions that will not survive real-world usage.

**For a marketing director:** The promise is exciting — "AI that manages your social media." The reality is a half-finished tool that requires API keys, developer portal accounts, terminal commands, and technical troubleshooting. Without a technical co-founder or IT support, you will not get past the onboarding screen.

---

## Part II: Senior Engineer Review

### Security — The Scary Parts

#### Critical: PIN Reset Requires No Authentication

`packages/backend/src/routes/auth.ts:113` — The `POST /api/auth/reset-pin` endpoint accepts requests with **no session token**. Anyone who can reach the server can change the PIN. The comment literally says `"(no old PIN needed for local single-user app)"`. This is a documented, accepted security bypass. In production, this is an instant compromise.

**Fix:** Require an existing valid session token, or at minimum a one-time code tied to the machine.

#### Critical: Encryption Key Can Be Empty String

`packages/backend/src/lib/credentialStore.ts:6-9` — If `ENCRYPTION_KEY` is not set in `.env`, the encryption key is `sha256("")` — a known, computable value. All stored OAuth credentials become trivially decryptable.

**Fix:** Validate `ENCRYPTION_KEY` at startup. If it's empty or the default placeholder, refuse to start.

#### High: Session Expiry Parsing Can Be Bypassed

`packages/backend/src/middleware/auth.ts:22` — The session token is stored as `token|expiry`. If the expiry value is malformed, `Number(expiry)` is `NaN`, and `Date.now() > NaN` is always `false` — the token never expires.

**Fix:** Add `isNaN()` check. Better: use JWT with proper verification instead of homemade pipe-delimited tokens.

#### High: No Rate Limiting on Auth Endpoints

`packages/backend/src/index.ts:133` — The global rate limiter explicitly **excludes** all auth routes. Only `verify` has its own 5/min limit. `setup`, `reset-pin`, and `renew` have no limits at all. Brute force is trivial.

**Fix:** Add rate limits to every auth endpoint. At minimum 10/min for non-sensitive, 3/min for sensitive operations.

#### High: No Input Validation Anywhere

Every route handler casts `request.body as { ... }` with zero runtime validation. Malformed JSON, missing fields, wrong types — none are caught. A single bad request can crash the handler with `TypeError: Cannot read properties of undefined`.

**Fix:** Adopt Zod or Joi for request validation. Every route gets a schema. This catches bugs at the boundary before they reach business logic.

#### Medium: SHA-256 for PIN Hashing

`packages/backend/src/routes/auth.ts:8-10` — PINs are hashed with a single SHA-256 round. No salt, no work factor. GPU-based brute force can try billions of combinations per second.

**Fix:** Use bcrypt (cost factor 10+) or argon2id. For a 4-8 digit numeric PIN, this matters less than for passwords — but it's still wrong.

#### Medium: OAuth State Stored In-Memory Only

`packages/backend/src/lib/oauthManager.ts:464-483` — The `pendingStates` Map lives in process memory. Server restart wipes all pending OAuth flows. In production with real users, someone will inevitably hit this during a deploy.

**Fix:** Store OAuth state in the database (or Redis if available). Clean up expired entries with a background job.

#### Low: No CSRF Protection

The app uses `@fastify/helmet` but doesn't configure CSRF protection. For a header-token auth scheme this is partially mitigated, but it's still a gap.

---

### Architecture — What Needs Rethinking

#### 1. SQLite is Not Production-Ready

SQLite is fine for a single-user local dev tool. It is not appropriate for a "marketing operations platform." No concurrent writes, no replication, no access control, no backup strategy beyond file copy. The `app_settings` key-value table stores PIN hashes, session tokens, encrypted credentials, and app config in one denormalized table.

**What to do:** Migrate to PostgreSQL. Use Drizzle Kit for migrations (not the current mix of DDL + raw SQL + imperative migration files). Add foreign key constraints — currently every `brand_profile_id` column references `brand_profiles.id` by convention only.

#### 2. Double Schema Definition Is Asking for Trouble

`packages/backend/src/db/index.ts` defines tables via raw SQL `CREATE TABLE IF NOT EXISTS` (500+ lines). `packages/backend/src/db/schema.ts` defines the same tables via Drizzle ORM. These **will** drift. Column additions use raw `ALTER TABLE` with try/catch. Migrations exist but are partially manual.

**What to do:** Delete `db/index.ts` DDL. Use Drizzle Kit migrations exclusively. One source of truth.

#### 3. The Cron Job Pattern Is Fragile

`packages/backend/src/index.ts:267-440` — Twelve cron jobs defined inline with anonymous functions. Several use `setTimeout` with 90-second delays (fire-and-forget). If the cron handler finishes before the timeout fires, the work is lost. There's no queue, no retry, no observability.

**What to do:** Use BullMQ (already a dependency) for all async work. Cron jobs enqueue jobs; workers execute them. This gives retries, observability, and graceful shutdown.

#### 4. The Route Registration Is Monolithic

34 route files registered in one sequential block. Any route can throw at register time and crash the entire server. No versioning prefix. No health-checked route groups.

**What to do:** Group routes by domain, add graceful registration with error isolation, and prefix API versions (`/api/v1/...`).

#### 5. Global Mutable Singletons Everywhere

- `let io: Server` — single Socket.IO instance, module-level mutable
- `_getApp: () => FastifyInstance` — module-level closure for shutdown
- All zustand stores — module-level singletons
- `db` — single database connection

This makes testing impossible without careful cleanup and prevents horizontal scaling.

**What to do:** Use dependency injection or a container pattern. For Socket.IO, consider a Redis adapter for horizontal scaling.

#### 6. The Shutdown Handler Imports Itself

`packages/backend/src/index.ts:514` — `const { io: socketIo } = await import('./index')` — the file dynamically imports itself at runtime. This is the kind of hack that works until it doesn't.

**What to do:** Extract shutdown logic to a separate module. Pass dependencies explicitly.

---

### Code Quality — Inconsistencies & Debt

#### Silent Catch Blocks (18+ instances)

Throughout the codebase, errors are swallowed silently:

```typescript
catch { /* ignore */ }
catch { // best-effort }
catch { // ignore — still mark as connected even if registration fails }
```

This is the single biggest obstacle to debugging. When something breaks, there is zero signal — no log, no toast, no error state.

**Fix:** Every `catch` block should either:

1. Log with structured context (at minimum `console.error('[ComponentName] Failed to X:', err)`)
2. Show a user-visible error (toast, inline message)
3. Re-throw if the caller handles it

#### `app_settings` as a God Table

This single key-value table is used for: PIN hashes, session tokens, app config, encrypted credentials, onboarding state, approval rules, cron timestamps, and more. It's queried on every auth check, every settings page, every config read. As the app grows, this becomes a contention point.

**Fix:** Split into proper tables: `sessions`, `user_settings`, `app_config`, `cron_tracker`, `onboarding_progress`.

#### No Monorepo Tooling

The project uses npm workspaces but has no turborepo, nx, or changesets. There's no shared type package — `packages/frontend` and `packages/backend` often define the same types independently. The Vite config has a `@shared` alias pointing to a non-existent `packages/shared` directory.

**Fix:** Adopt turborepo for caching and task orchestration. Create a `packages/shared` for types, validation schemas, and constants.

#### Hardcoded Values

- `FRONTEND_URL_ALT = 'http://localhost:5174'` — hardcoded string at `index.ts:103`
- `24 * 60 * 60 * 1000` — session expiry, not a named constant
- `600` rate limit — why 600? Why 15 minutes?
- `'9+'` — sidebar badge truncation
- `['welcome', 'llm', 'brand', 'social', 'complete']` — step names repeated in two files

**Fix:** Extract all magic values into a `constants.ts` file. Use environment variables for anything deployment-specific.

#### Mixed Theming Systems

Three theming systems coexist:

1. Tailwind utility classes (`bg-slate-50`, `dark:bg-slate-900`)
2. CSS custom properties (`var(--bg-base)`, `var(--text-primary)`)
3. Manual dark mode class toggling

The Tailwind config overrides default font sizes and shadows, which means `shadow-md` (used in the codebase) may not render as expected.

**Fix:** Choose one theming system. If CSS variables, use Tailwind's `var()` resolution consistently. If Tailwind classes, remove the CSS variable overrides.

---

### Testing — The Silent Crisis

**Frontend:** 2 test files (`ToastNotification`, `ConnectorCard`)
**Backend:** 3 test files (`promptSanitizer`, `credentialStore`, `contentGenerationService`)
**Integration:** 0
**E2E:** 0

For a project with 30+ route files, 28 services, 11 agents, 12 stores, and 19 pack definitions, this is critically insufficient. The system has:

- Complex OAuth flows with popup windows and polling
- Cron-jobs with inter-dependent steps (90-second timeouts)
- LLM prompt chains with fallback logic
- Real-time Socket.IO event propagation
- A marketplace/pack installation system with multiple interdependent API calls

None of this is tested. A refactor of any of these systems is a blind trust exercise.

**Minimum viable test suite:**

1. Auth middleware tests (using `light-my-request` for in-process Fastify testing)
2. Route handler integration tests for auth, connectors, and packs
3. Store unit tests (zustand stores are trivial to test)
4. OAuth flow integration test
5. Prompt sanitizer tests (existing, but need expansion)
6. At least 1 E2E test covering: system check → PIN setup → login → connector hub → install pack

---

### Performance & Scalability

#### Current Issues

- **No code splitting** — the frontend is a single bundle. With 1600+ line components, this is a slow initial load.
- **`useMemo`/`useCallback` missing** — sidebar socket handlers, route trees, and discovery data are recomputed on every render.
- **34 static route imports** — all loaded at startup, increasing cold start time.
- **`setImmediate` for async work** — campaign completions trigger fire-and-forget LLM calls with no queue.
- **No image optimization** — no lazy loading, no WebP, no srcSet.
- **SQLite contention** — concurrent cron jobs + user requests compete for the same single-write database.

#### What Breaks First Under Load

1. **The `app_settings` table** — queried on every request (auth check + config read). With 10+ concurrent users, this becomes a bottleneck.
2. **The in-memory OAuth state** — 10-minute expiry with no persistence. Concurrent OAuth flows will collide.
3. **The `better-sqlite3` synchronous DDL** — if migrations run while the app is serving requests, the database is locked.
4. **The fire-and-forget cron timeouts** — 90-second `setTimeout` inside a cron that exits in under 1 second. The promise is orphaned.

---

## Part III: Non-Technical User Review

### First Impression — Why Would I Use This?

**What you see:**

A dark terminal window with scrolling log output. A URL printed at the end. You open Chrome and see a system check page with spinning icons. Then a PIN setup screen. Then an LLM API key setup. Then a brand profile form. Then a social connect page.

**What you think:**

"Why do I need a terminal? What's an API key? I just want to post to Instagram. My last IT person quit and I don't have a developer on staff."

**The problem:**

VIMO's current onboarding assumes the user is a developer or has one on staff. The system check requires understanding Node.js versions, encryption keys, and `.env` files. The LLM setup requires an OpenAI/Anthropic account and API key. The social connect requires creating developer apps on Facebook/Google/LinkedIn.

For a non-technical marketing director, three things are true:

1. You have no idea what an API key is
2. You are not going to create a Facebook Developer App
3. You have already closed the browser tab

**What should change:**

VIMO needs a **zero-config demo mode**. The user should be able to click "Try it now" and see a fully functional dashboard with sample data, sample campaigns, and sample insights — without connecting anything, without API keys, without terminal commands.

The real value proposition ("AI that manages your social media") should be visible **before** the user invests time in setup. Right now, the value is behind a wall of technical hurdles.

---

### Onboarding — The Wall of Hurdles

#### Step 1: System Check (Confusing)

Shows: Node.js version check, database check, encryption check.

Non-technical user thinks: "Node.js? Database? Encryption? I just downloaded this thing. Why is it checking its own files? Is something broken?"

**Fix:** A progress bar with plain English: "Starting up... ✓ Almost ready... ✓" No technical details unless something fails.

#### Step 2: PIN Setup (Fine)

This is the only step that makes immediate sense. "Set a PIN to protect your installation." Clear, actionable, standard.

**Verdict:** Keep as-is.

#### Step 3: LLM API Key (Dealbreaker)

Shows: A list of AI providers (OpenAI, Anthropic, Groq, Ollama). Requires an API key. Has a "Skip for now" link.

Non-technical user thinks: "I need to sign up for OpenAI? With my credit card? Just to try this? And 'Skip for now' takes me to the next step but... what will work without this? Also, Ollama? What is that?"

**The hard truth:** Requiring an LLM API key is the #1 user acquisition killer. Most of VIMO's features (Marketing Director, content generation, engagement replies, trend analysis) depend on this key. "Skip for now" creates an empty, non-functional product.

**Fix options (in priority order):**

1. **Free tier LLM** — Bundle a shared API key with limited quota (e.g., 100 requests/day). The user can upgrade later.
2. **Local LLM support** — Auto-detect Ollama and use it silently. If installed, skip the LLM setup entirely.
3. **Demo mode** — Pre-populate everything with mock data so the user sees value before paying/subscribing.
4. **At minimum** — Explain WHY they need this in plain language, not just an input field.

#### Step 4: Brand Setup (Acceptable)

Asks for brand name, industry, target audience. This makes sense. It's the first step that feels like "marketing software."

**Verdict:** Keep, but add placeholder suggestions to make it faster.

#### Step 5: Social Connect (Impossible)

Shows: "Connect your social accounts." Buttons for Instagram, Facebook, LinkedIn, YouTube, TikTok, Pinterest.

Non-technical user clicks "Connect Instagram." A popup opens to Facebook's developer portal asking them to create an app. They close it and never come back.

**The hard truth:** OAuth for personal social media accounts requires creating developer apps. This is a deliberate limitation by Meta/Google/LinkedIn. For a non-technical user, this is effectively impossible.

**Fix:**

1. **Publishing tokens** — VIMO should have a built-in proxy that handles the OAuth dance on the user's behalf (like Buffer or Hootsuite does).
2. **Content-only mode** — For users who can't connect accounts, offer a "create and download" workflow: schedule posts → get notified → manually post.
3. **Browser extension** — A companion extension that can post on behalf of the user without OAuth developer setup.

---

### Daily Use — What Actually Works

#### The Dashboard

After onboarding, the user sees:

- An AI assistant greeting ("Hello—ready to review what needs your attention today?")
- A collapsed "Performance Snapshot" showing 0 followers, 0% engagement, 0 posts
- An "Inbox Zero" screen

**What works:** The greeting is friendly. The "Inbox Zero" visual is clean. The sidebar navigation makes sense.

**What doesn't:** Everything shows zero because nothing is connected. The "Marketing Director" hasn't found any opportunities because there's no data to analyze. The AI assistant can't suggest anything meaningful because there's no brand context, no connected accounts, no campaign history.

**Fix:** Seed the system with sample data. Every new installation should have:

- 3-4 sample opportunities (pre-generated, realistic)
- Sample brand insights
- A pre-written morning briefing
- Contextual tooltips explaining "This is what your dashboard will look like once you connect accounts"

#### The Connector Hub

This is actually well-designed. The pack/marketplace concept is intuitive. Categories make sense. The "Installed" section is helpful.

**What needs work:**

- 19 packs is overwhelming for a first visit. Show the top 5-6 popular ones, with a "See all" link.
- The "Intelligence" packs (SEO, competitor tracking, etc.) sound great but deliver mostly guesswork (the scrapers return mock data when real APIs aren't connected).
- The "install → setup assistant → credentials → discover" flow is too many steps. A one-click "quick install" with default settings would help.

#### The Intelligence Page

Promises: "AI-powered market intelligence and competitor insights."

Delivers: An empty "No trends detected yet" message. An empty "No competitors tracked yet" message. An empty "No opportunities found yet" message.

For a user who just went through 5 onboarding steps and connected their accounts, this is disappointing. The subtext "VIMO's Trend Hunter runs every 4 hours" — the user is supposed to wait 4 hours to see if the tool works?

#### The Marketing Director

The crown jewel of VIMO — an AI agent that analyzes your marketing and suggests actions. But:

1. It requires an LLM API key (80% of users will skip this)
2. It requires connected data sources (most users won't get past OAuth)
3. It runs on a cron schedule (first results appear 8 hours after setup)
4. There's no "Run Now" button

**Result:** The feature that should be VIMO's killer app is invisible to new users.

---

### The Trust Problem

Non-technical users evaluate software by answering one question: **"Will this save me time?"**

VIMO currently answers: **"Spend 45 minutes setting up developer accounts, API keys, and technical configurations. Then wait 8 hours for the AI to run. Then you might see something useful."**

That's not a winning value proposition.

**What would build trust:**

1. **Show value first** — Demo mode with sample data. Let the user click around and think "wow, this could work for me."
2. **One-click setup** — "Connect with Google" instead of "Create a Google Developer App."
3. **Progressive complexity** — Start with basic scheduling. Introduce AI features as "pro" upgrades.
4. **Guided success path** — After onboarding, show a checklist: "✓ PIN set — ✓ Brand created — ◻ Connect Instagram — ◻ First campaign"
5. **Mobile** — A mobile app for approvals, quick posts, and notifications. Marketing directors live on their phones.

---

## Part IV: Prioritized Improvement Roadmap

### P0 — Ship Blockers (Do before any user touches this)

| #   | Area     | Change                                                                            | Effort  |
| --- | -------- | --------------------------------------------------------------------------------- | ------- |
| 1   | Security | Guard `reset-pin` with session check; remove documented auth bypass               | 1 hour  |
| 2   | Security | Validate `ENCRYPTION_KEY` at startup; refuse to start with empty/default key      | 1 hour  |
| 3   | Security | Add rate limiting to ALL auth endpoints                                           | 2 hours |
| 4   | Security | Fix session expiry `NaN` bypass with isNaN() guard                                | 30 min  |
| 5   | Arch     | Add input validation (Zod) to all request handlers — start with auth + connectors | 1 week  |
| 6   | Code     | Eliminate all silent catch blocks. Every catch logs or shows error.               | 2 days  |
| 7   | UX       | Add demo/sandbox mode so users can explore before setup                           | 1 week  |
| 8   | UX       | Pre-seed dashboard with sample data (opportunities, briefing, stats)              | 2 days  |

### P1 — Critical Quality

| #   | Area     | Change                                                                               | Effort  |
| --- | -------- | ------------------------------------------------------------------------------------ | ------- |
| 9   | Security | Replace SHA-256 PIN hashing with bcrypt                                              | 1 day   |
| 10  | Security | Store OAuth state in DB instead of in-memory Map                                     | 1 day   |
| 11  | Arch     | Consolidate schema: delete raw DDL in `db/index.ts`, use Drizzle migrations only     | 2 days  |
| 12  | Arch     | Extract `app_settings` into proper tables: `sessions`, `user_settings`, `onboarding` | 2 days  |
| 13  | Testing  | Route handler tests for auth endpoints                                               | 2 days  |
| 14  | Testing  | Store unit tests (authStore, onboardingStore, socialAccounts store)                  | 1 day   |
| 15  | UX       | Replace "Skip for now" on LLM step with local Ollama detection + auto-config         | 2 days  |
| 16  | UX       | Simplified OAuth flow: one-click connect for common providers                        | 2 weeks |

### P2 — Important Polish

| #   | Area | Change                                                 | Effort |
| --- | ---- | ------------------------------------------------------ | ------ |
| 17  | Arch | Extract cron jobs to BullMQ workers                    | 1 week |
| 18  | Code | Extract magic values to constants.ts                   | 1 day  |
| 19  | Code | Fix `@shared` alias or remove it                       | 1 hour |
| 20  | Code | Remove duplicate `canva.ts` routes                     | 1 hour |
| 21  | Code | Fix circular `import('./index')` in shutdown handler   | 1 day  |
| 22  | UX   | Mobile-responsive layout                               | 1 week |
| 23  | UX   | Add "Run Marketing Director Now" button on dashboard   | 1 day  |
| 24  | UX   | Onboarding checklist after setup (guided success path) | 2 days |
| 25  | UX   | Sidebar badge for >99 (not truncating at 9+)           | 1 hour |
| 26  | UX   | Fix decorative "Fix" button in Social Accounts         | 1 hour |
| 27  | UX   | Add loading skeletons to Intelligence page tabs        | 1 day  |

### P3 — Nice to Have

| #   | Area    | Change                                                                | Effort |
| --- | ------- | --------------------------------------------------------------------- | ------ |
| 28  | Arch    | Docker + docker-compose setup                                         | 2 days |
| 29  | Arch    | PostgreSQL migration guide                                            | 1 week |
| 30  | Arch    | Turborepo / monorepo tooling                                          | 2 days |
| 31  | Testing | E2E test with Playwright                                              | 1 week |
| 32  | Testing | Integration test for OAuth flow                                       | 2 days |
| 33  | UX      | Interactive onboarding tour (fix: make dismissible, add close button) | 1 day  |
| 34  | UX      | Notification history (not just auto-dismissing toasts)                | 2 days |
| 35  | UX      | "Run Marketing Director Now" button                                   | 1 day  |
| 36  | UX      | ChatGPT-style in-app assistant for questions                          | 3 days |
| 37  | Perf    | Code splitting + lazy loading for route components                    | 2 days |
| 38  | Perf    | Image optimization pipeline                                           | 1 day  |
| 39  | Perf    | Add `useMemo`/`useCallback` to critical render paths                  | 2 days |

---

## Part V: Long-Term Vision

### Where VIMO Should Be in 12 Months

#### Architecture

- **PostgreSQL** instead of SQLite — proper migrations, concurrent access, replication
- **BullMQ** for all async work — no more `setTimeout(fn, 90000)` inside cron jobs
- **Docker** deployment — one command: `docker compose up`
- **API versioning** — `/api/v1/...` prefix on all routes
- **OpenAPI/Swagger** — auto-generated docs from Zod schemas
- **Proper auth** — JWT with refresh tokens, optional SSO (Google, GitHub)

#### User Experience

- **Desktop app** — Electron wrapper so users don't need a terminal
- **Mobile companion** — Notifications, approvals, quick posts
- **Demo mode** — "Try it now" without any setup, pre-loaded with sample data
- **Zero-config social** — Built-in OAuth proxy for Instagram, Facebook, LinkedIn
- **Freemium LLM** — Bundled API key with daily quota so users see AI features before paying
- **Guided success path** — Post-onboarding checklist: "✓ Connect Instagram → ✓ First campaign → ✓ AI suggestions"

#### Product

- **Narrower focus** — Instead of "everything for marketing," pick one wedge: either "content scheduler with AI" or "social listening" or "analytics dashboard." Do that one thing perfectly, then expand.
- **Templates** — Campaign templates for common scenarios (product launch, seasonal sale, brand awareness)
- **Collaboration** — Invite team members, approval workflows, role-based access
- **Integrations** — n8n/Zapier/Make.com webhooks so VIMO can be part of a larger workflow
- **Export** — Download campaigns, analytics, content calendar as PDF/CSV

### The Hardest Decision

VIMO has an identity problem. Is it:

1. **A local-first privacy tool** for solo creators who value data ownership? → Focus on easy setup, Ollama integration, offline mode, export/import.
2. **A SaaS marketing platform** for small teams? → Focus on collaboration, cloud deployment, SSO, mobile app.
3. **An AI experiment** showcasing what's possible with LLMs + marketing data? → Focus on demo mode, prompt quality, unique insights.

Right now, VIMO tries to be all three and succeeds at none. **Pick one.** The architecture, UX, and marketing should all point in the same direction.

---

## Final Verdict

**From a senior engineer:** The codebase shows good technical taste (Fastify, Drizzle, Zustand, Tailwind) but lacks production hardening. The security gaps are fixable but real. The lack of tests is the biggest risk — every refactor will be terrifying. The architecture is appropriate for a v1 but needs significant investment to scale.

**From a non-technical user:** The concept is compelling. The execution is frustrating. Too many technical barriers stand between the user and the value proposition. Without a demo mode or zero-config setup, most non-technical users will never experience what VIMO can actually do.

**The good news:** Both perspectives agree on the #1 priority: **show value before asking for commitment.** For engineers, that means demo mode with sample data. For users, that means exploring a working product before investing in OAuth setup and API keys.

Everything else — security hardening, migrations, testing, mobile — is important but secondary. If users can't get past the first screen, nothing else matters.
