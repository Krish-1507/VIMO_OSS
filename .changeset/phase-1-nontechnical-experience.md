---
"vimo": minor
"@vimo/backend": minor
"@vimo/frontend": minor
---

Phase 1 — make VIMO usable by a non-technical person.

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
