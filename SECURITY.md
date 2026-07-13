# Security Policy

VIMO is a **self-hosted, single-user** application. It handles sensitive things — your social
accounts, your AI provider keys, your brand's data — so we are explicit about what we store, why,
and how it's protected. This document is intentionally honest; if something isn't perfect, we say
so.

## Reporting a Vulnerability

Please report security issues privately to **security@vimo.dev** (replace with your real address).
We will acknowledge within 3 business days and give you a timeline for a fix. **Do not open public
issues for vulnerabilities** until a fix is released.

## Data Protection

- **Local-only storage.** All brand data, campaigns, logs, and connector metadata live in a local
  SQLite database (`DB_PATH`, default `./data/vimo.db`). Nothing is sent to VIMO servers.
- **Credential encryption at rest.** API keys, OAuth access tokens, and refresh tokens are
  encrypted with **AES-256-GCM** before they are written to disk. The key is `ENCRYPTION_KEY` in
  your `.env`. Decryption happens only in memory, only when a connector actually uses the secret.
- **No telemetry.** VIMO does not collect or transmit usage data or analytics to external servers.
- **Prompt sanitization.** User- and scraped-content inputs are sanitized before being sent to LLMs
  to reduce prompt-injection impact.
- **Error sanitization.** Error messages returned to the UI are mapped to friendly, token-free
  text. OAuth secrets, access tokens, and raw API details are never surfaced to the client.

## What We Store and Why

Honesty about the data model:

| Data                                                    | Where                                        | Encrypted?                                            | Why                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connector metadata (id, name, provider, status, config) | `connectors` table                           | No (metadata only)                                    | Needed to route requests and show your connections. Contains no secrets.                                                                                                                                                                                               |
| API keys / OAuth tokens / app passwords                 | `app_settings` as `cred:<connectorId>:<key>` | **Yes** (AES-256-GCM)                                 | Required to act on your behalf. Never stored in plaintext.                                                                                                                                                                                                             |
| Session token (`<token>\|<expiry>`)                     | `app_settings` key `session_token`           | **Yes** (AES-256-GCM, same key/scheme as credentials) | VIMO is a local single-user app. The token is a random 256-bit value, returned only to the verifying client, encrypted at rest, and cleared on logout/reset. For multi-user or exposed deployments, front it with a reverse proxy + TLS and treat the host as trusted. |
| PIN hash                                                | `app_settings` key `pin_hash`                | Yes (SHA-256)                                         | Local login gate; only the hash is stored.                                                                                                                                                                                                                             |
| Brand data, posts, campaigns, memory                    | `SQLite` tables                              | No                                                    | Your actual marketing content. Local only.                                                                                                                                                                                                                             |
| AI usage (tokens, model, cost)                          | local tables                                 | No                                                    | Cost transparency dashboard. Local only.                                                                                                                                                                                                                               |

We call out the session token deliberately: as of the latest release it **is** encrypted at rest with
the same AES-256-GCM scheme used for connector credentials (the `<token>|<expiry>` blob is encrypted
before it touches the database). It remains a single ephemeral local session, not a long-lived
credential. If your threat model includes other users on the same machine or a publicly reachable
instance, run VIMO behind authenticated TLS and never expose port 3000 directly.

## Secrets Hygiene

1. **Never commit `.env`.** It is git-ignored. Use `.env.example` (committed) as a template.
2. **Generate a strong `ENCRYPTION_KEY`.** At least 32 random characters. If you change it,
   previously-encrypted credentials become unreadable — that's the point.
   ```bash
   # Example: generate a 32-byte key
   openssl rand -hex 32
   ```
3. **Scope your provider keys.** Use least-privilege tokens (e.g., a GitHub token with only the
   scopes VIMO needs). Revoke and rotate keys if a machine is compromised.
4. **OAuth over keys when possible.** One-click providers (GitHub, Notion, Canva) avoid storing
   long-lived secrets you typed by hand.
5. **Rotate on disconnect.** Removing a connector deletes its stored credentials from
   `app_settings`.

## Secure Deployment Notes

- **Localhost model.** VIMO is designed for a single user on `localhost`. Running it on a
  publicly accessible server requires a reverse proxy with TLS and, ideally, an authenticating
  layer in front.
- **Rate limiting** is applied to auth and AI-calling routes out of the box.
- **Session expiry** is 24h and renewable; logout clears it.

## Cross-Site Request Forgery (CSRF)

VIMO authenticates with a custom **`x-session-token` header, not a cookie**. Because a browser will
not automatically attach a custom header to a cross-site request, classic CSRF is already prevented
at the transport level — an attacker's page cannot forge an authenticated request without the token.

As defense-in-depth (and to stay forward-compatible with any future cookie-based session), every
**state-changing** request (POST/PUT/PATCH/DELETE) must also carry an `x-csrf-token` header equal to
the session token (a double-submit token). The backend rejects state-changing requests without a
matching token (`403`). The frontend attaches this token automatically (`src/lib/csrf.ts` patches
`window.fetch`; `src/lib/api.ts` sets it on the axios client), so application code does not need to
think about it. Auth endpoints under `/api/auth/*` are exempt, as is standard.

> Honest note: with header-based auth this check is belt-and-suspenders. Its real value shows up if
> VIMO ever moves to cookie sessions, where CSRF becomes a genuine threat.

## Reverse Proxy & Rate-Limit Gotchas

The global rate limiter (`@fastify/rate-limit` in `packages/backend/src/index.ts`) exempts
`/api/health` and `/api/auth*` from the global cap — sensible for local use so logins are never
throttled. **Be aware of these proxy gotchas before exposing VIMO:**

- **Client IP is the proxy's IP.** `@fastify/rate-limit` keys on `request.ip`. Behind a reverse
  proxy (nginx, Traefik, Cloudflare) every user appears to come from the proxy, so the limiter either
  throttles everyone at once or never triggers. Set `app.setTrustProxy(true)` (or configure
  `trustProxy`) and forward `X-Forwarded-For` so rate limits are per real client. Do **not** rely on
  the `/api/auth` allow-list as your only protection on a public host — it only lifts the global cap,
  it does not authenticate.
- **TLS termination.** Terminate TLS at the proxy and send `X-Forwarded-Proto: https`; otherwise
  secure-cookie/CSRF assumptions break.
- **WebSocket/Socket.IO** also rides behind the proxy — forward upgrade headers.

## Logging Hygiene

- **Request URLs are sanitized.** The `[Request]` log records only the pathname; the query string is
  dropped on purpose because provider callbacks (OAuth `code`, `access_token`, etc.) can carry
  secrets that must never reach the logs.
- Secrets (OAuth tokens, API keys, raw errors) are never written to client-facing responses; see
  Error sanitization above.

## Supported Versions

Only the latest release of VIMO receives security fixes. Please stay on the newest version.
