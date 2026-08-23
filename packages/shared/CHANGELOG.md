# @vimo/shared

## 1.0.1

### Patch Changes

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
