# @vimo-oss/cli

## 2.2.4

### Patch Changes

- 50d9861: Sync release: republish the launcher so `npm i -g vimo-oss` carries the current generation (self-updating launcher, forced app refresh, visible versions). No launcher code changes — this bump is the update signal for existing installs.

## 2.2.3

### Patch Changes

- 094a429: The launcher can finally update itself: `vimo --update` now refreshes the launcher from npm first (re-executing into the new copy) and then the app with a forced reinstall + rebuild, so `npm i -g vimo-oss` plus `vimo --update` can never get stuck on a stale version again. Also hardens interrupted downloads (copy fallback instead of losing the install), warns when `--update` is pointed at a user-owned checkout, and fails fast with a clear message when no unpack tool exists.

## 2.2.2

### Patch Changes

- da69a72: Fix the first-run installer failing instantly on Windows ("Installing components didn't finish"): spawning npm.cmd now uses a shell as required by Node >= 18.20. Also quiets harmless startup warnings and clarifies installer error text.

## 2.2.1

### Patch Changes

- 9960712: Redesigned launcher banner: bold block-letter VIMO wordmark with an aqua-to-blue gradient, branded title line, and clean plain-text fallback when output is piped or NO_COLOR is set.

## 2.2.0

### Minor Changes

- 8f2ceec: Rename the npm package from `@vimo-oss/cli` to **`vimo-oss`** (unscoped) so it can be installed with `npm i -g vimo-oss`. Commands stay `vimo` / `VIMO`.

## 2.1.0

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

### Patch Changes

- d0d4d14: Production launch path + installer hardening.

  - Single-port production mode: the backend serves the built frontend (same origin), so `npm run build:app` + `npm run start:app` (and the launcher) need only one process and one port.
  - CLI renamed to `@vimo-oss/cli` (the `vimo` npm name belongs to an unrelated package); installs now provide both `vimo` and `VIMO` commands; downloads a tarball instead of requiring git; probes free ports; `--update`, `--doctor` flags.
  - Scheduler: restart no longer publishes future-dated posts early (rescue query filters by time, plus a not-due guard in processPost).
  - Auth: `/api/auth/setup` can no longer overwrite an existing PIN unauthenticated; reset codes are returned inline only to loopback requests; server binds to `127.0.0.1` unless `HOST` is set.
  - First run: the system check sends new users to the PIN setup screen instead of silently generating a PIN they never see.
  - Frontend: all API calls go through the shared client (session + CSRF headers everywhere); automatic session renewal with transparent retry on 401; demo mode immune to login redirects.
