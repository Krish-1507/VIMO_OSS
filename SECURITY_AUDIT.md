# SECURITY_AUDIT.md (Defense-in-Depth)

This document reviews the current security posture of VIMO (backend + integration layer) against the project’s non-negotiable security philosophy: **automatic, invisible protection for non-technical users**, with **defense-in-depth** across authentication, authorization, input validation, integration safety, secret handling, transport hardening, and logging/auditability.

> Note: This audit is based on the currently visible implementation in the repository. It does **not** constitute a complete formal security review.

---

## 1) Executive Summary

### What is already in place (good)
- **Baseline server hardening**: `helmet`, `@fastify/cors`, multipart handling, and request rate limiting are registered in `packages/backend/src/index.ts`.
- **Global auth gate**: a Fastify `onRequest` hook protects all routes except `/api/auth*`, `/api/connectors/presets`, and `/api/health`.
- **Credential encryption at rest**: connectors’ credentials are encrypted using **AES-256-GCM** in `packages/backend/src/lib/credentialStore.ts`.
- **Some password/input hygiene exists** conceptually (e.g., PIN validation rules in `packages/backend/src/routes/auth.ts`).
- **Audit log storage exists** (`agentLogs`), and there is an audit log viewer endpoint: `GET /api/settings/audit-logs` in `packages/backend/src/routes/settings.ts`.

### Major gaps vs the stated non-negotiables (needs work)
- **Authentication model is not JWT-based** and does not implement:
  - access token + rotating refresh token
  - JWT signing (RS256/HS256) rules
  - secure cookie session model with CSRF protection
  - optional TOTP/backup codes “Extra Security”
  - account lockout after repeated failures
  - session invalidation on password change (not applicable in current PIN model)
- **Authorization / RBAC is missing**: protected endpoints do not implement Owner/Admin/Editor/Viewer checks.
- **Rate limiting is not defense-in-depth enough**:
  - global `rateLimit` is set high (`max: 500/min`) and only loosely scoped via an allowList.
  - no explicit “strict on `/auth/*` (5/min)” and “moderate on `/api/*` (60/min)” mapping.
- **CSRF protection is not present** (current implementation uses a custom header `x-session-token`, not cookies).
- **Secret management safety claims are inconsistent**:
  - `packages/backend/src/index.ts` auto-creates/updates `.env` with an encryption key placeholder update flow.
  - `packages/backend/src/lib/credentialStore.ts` derives the encryption key from `process.env.ENCRYPTION_KEY`, but does not enforce failure if the key is missing/weak.
- **Integration safety controls are incomplete**:
  - connector integration flow exists, but does not implement per-tool approval modes, scopes-by-English-UI, sandbox/resource/network restrictions, or audit logging “behind the scenes” for integration actions.
  - there is an endpoint named `/api/connectors/mcp/connect` which includes “MCP” wording in backend errors. While the UX must never show the word to users, internal wording should still be treated carefully to avoid accidental UI surfacing.

---

## 2) Current Implementation Walkthrough (by area)

### 2.1 Transport / HTTP Security Headers
**Where**: `packages/backend/src/index.ts`
- `app.register(helmet)` is present, but the exact Helmet configuration (CSP/HSTS/etc.) is not shown here.
- CORS is configured with `origin: [FRONTEND_URL, FRONTEND_URL_ALT]`.

**Assessment**
- ✅ Helmet + CORS present (good baseline).
- ⚠️ Helmet defaults may not match the desired strict posture:
  - “strict CSP”
  - HSTS and secure transport enforcement
  - `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`
- ✅ No wildcard CORS in current code (good).

**Recommendation**
- Explicitly configure Helmet with the required policy (CSP/HSTS/XFO/nosniff/etc.).
- Add HTTPS enforcement guidance where applicable (reverse proxy / deployment).

---

### 2.2 Rate Limiting
**Where**: `packages/backend/src/index.ts`
- `@fastify/rate-limit` registered with:
  - `max: 500`
  - `timeWindow: '1 minute'`
  - allowList allows `/api/health` and `/api/auth*`

**Assessment**
- ❌ Does not match the non-negotiable target:
  - strict on `/auth/*` (5/min)
  - moderate on `/api/*` (60/min)
- ❌ AllowList logic permits auth endpoints without the global limit (depending on Fastify allowList semantics; this design still does not implement the “5/min on auth” requirement).

**Recommendation**
- Apply per-route/per-prefix rate limits:
  - `/api/auth/*`: 5/min strict
  - `/api/*`: 60/min moderate
- Ensure connector-heavy endpoints also get appropriate limits (connect/test).

---

### 2.3 Authentication
**Where**:
- `packages/backend/src/middleware/auth.ts`
- `packages/backend/src/routes/auth.ts`
- route protection in `packages/backend/src/index.ts`

**Current behavior**
- Auth uses:
  - request header: `x-session-token`
  - session token stored in `app_settings` table (`key = session_token`)
  - token stored as `token|expiry`
  - expiry checked on each request

- PIN-based flows:
  - `/api/auth/setup` sets `pin_hash` and `app_config.isSetupComplete`
  - `/api/auth/verify` checks `pin`, stores session token for 24h

**Assessment**
- ❌ Not JWT access/refresh.
- ❌ No rotating refresh tokens or revocable sessions.
- ❌ No argon2id password hashing (PIN hash uses SHA-256).
- ❌ No email verification, password reset tokens, lockout, or 2FA.
- ❌ No session invalidation on password change (not implemented; also no password change flow).
- ⚠️ Single-user mode is conceptually consistent with “desktop default skipping login wall”, but current implementation still requires a session token once auth is set up.

**Recommendation**
- If the system must support non-technical UX and team/cloud deployments:
  - Keep single-user mode (no login wall) but implement a different auth model for desktop (e.g., local-only session).
  - For team/cloud: implement JWT RS256 or HS256 (secure long secret via env in server only), refresh token rotation, and cookie + CSRF protection.
- Replace SHA-based PIN hashing with a password/PIN hashing scheme (argon2id preferred or bcrypt cost >= 12+) and apply lockout after 5 failures.

---

### 2.4 Authorization / RBAC
**Where**
- No RBAC middleware was observed in:
  - `middleware/auth.ts` (only authentication)
  - `routes/settings.ts` (admin-like endpoints)
  - `routes/connectors.ts` (connector management)

**Assessment**
- ❌ RBAC (Owner/Admin/Editor/Viewer) not implemented.
- Settings endpoints include:
  - export, reset all data, clear analytics, audit logs viewer
  - these should be privileged and consistently protected with RBAC.

**Recommendation**
- Introduce RBAC claims (for JWT deployments) or an authorization model even for single-user setups.
- Enforce RBAC in every protected endpoint, ideally via a dedicated authorization middleware.

---

### 2.5 Input Validation & Output Safety
**Where**
- The server code shown uses basic checks (e.g., PIN regex and API key prefix checks).
- No Zod/DOMPurify evidence was found in the files reviewed.

**Assessment**
- ❌ Zod validation on every input is not present in the inspected files.
- ❌ DOMPurify for HTML input not evidenced.
- ⚠️ Prompt injection mitigations are only loosely supported through “promptSanitizer” (not yet reviewed in this audit).

**Recommendation**
- Introduce Zod schemas for:
  - request bodies
  - URL params
  - query params
- Apply HTML sanitization where HTML is accepted/stored.
- Ensure all LLM prompt assembly passes through a sanitizer and that output rendering is safe.

---

### 2.6 Secret Handling & Encryption at Rest
**Where**
- `packages/backend/src/lib/credentialStore.ts` uses AES-256-GCM.
- `packages/backend/src/index.ts` ensures `.env` exists and auto-fills a placeholder encryption key.

**Credential encryption assessment**
- ✅ Uses AES-256-GCM with IV + authTag.
- ✅ Key is derived deterministically from `process.env.ENCRYPTION_KEY` hashed with SHA-256 to 32 bytes.

**Major gaps**
- ⚠️ No explicit “fail closed” if `ENCRYPTION_KEY` is missing or too weak.
- ⚠️ `index.ts` edits/creates `.env` automatically in a way that may be acceptable for dev, but it conflicts with the UX promise:
  - “Zero config files editing by end users.”
  - While auto-creation is automatic, it’s still writing a `.env` on first run.
- ⚠️ Key rotation and “system keychain” behavior is not evidenced (keytar not reviewed).

**Recommendation**
- On desktop:
  - store encryption/JWT secrets via system keychain (keytar).
  - only fall back to env in dev.
- Add runtime validation: if ENCRYPTION_KEY is missing/placeholder, refuse sensitive operations and show a friendly “Setup required” flow.
- Ensure secrets are never logged; verify logger scrubbing (Pino PII scrubbing not reviewed in this audit).

---

## 3) Integration Security (Invisible, by design)

### Current connector/integration posture
**Where**: `packages/backend/src/routes/connectors.ts`
- Credentials can be stored encrypted via `storeCredential`.
- API key format hints are returned for invalid keys.
- `/api/connectors/mcp/connect` attempts a remote tool manifest fetch.

**Assessment**
- ❌ User consent modal + plain-English permission scopes not implemented here.
- ❌ Per-tool approval modes (“Always ask / Always allow / Never”) not evident.
- ❌ Sandbox resource/network restrictions for integration processes not evident.
- ❌ Audit logging for integration actions not evident beyond generic `agentLogs` table.
- ❌ Verification badge/warnings (“Verified by VIMO / Community”) not evidenced.
- ⚠️ Endpoint naming and error strings mention “MCP” internally; ensure the frontend never surfaces that term.

**Recommendation**
- Add a dedicated “Connections” consent flow:
  - explicit consent modal on every new connection
  - scopes displayed in plain English
  - approval modes
- Implement sandboxing primitives appropriate to platform:
  - local process isolation / least privilege
  - network policy restrictions
  - timeouts (e.g., 30s)
  - circuit breakers and friendly “taking longer than usual” UI signals
- Ensure audit log records:
  - connection granted/revoked
  - actions taken (with PII redaction)
  - tool approvals per action

---

## 4) Upload Security (Not Verified)
The non-negotiable requirements include:
- MIME type validation (magic bytes)
- size limits
- sanitized filenames
- store outside web root
- signed URLs for serving

**Assessment**
- Not reviewed in the inspected files. Multipart exists (`@fastify/multipart`), but upload handling code was not examined in this audit.

**Recommendation**
- Add/verify:
  - magic-bytes MIME sniffing
  - strict allowlists for upload content types
  - server-side max sizes (10MB default, 50MB uploads)
  - safe filename normalization
  - signed URL delivery

---

## 5) Logging, Audit, and Privacy
**Where**
- `appSettings`, `agentLogs` table.
- `formatError` used as a unified error formatter.
- Settings includes audit log viewer endpoint.

**Assessment**
- ✅ Audit log storage exists (`agentLogs` + viewer).
- ⚠️ PII redaction in logs is not confirmed in reviewed code.
- ⚠️ Structured logging with Pino not confirmed in reviewed code.
- ⚠️ Sentry toggle “off by default” not confirmed.

**Recommendation**
- Adopt Pino structured logging with:
  - PII scrubbing by default
  - integration credential redaction
- Ensure errors returned to client are friendly and non-technical while server retains technical details.

---

## 6) Concrete Gap List Mapped to Non-Negotiables

### P0 (must fix before production / team deployment)
- [ ] Replace session header approach with **JWT access token + rotating refresh token** for cloud/team mode.
- [ ] Enforce **RBAC** checks on every protected endpoint.
- [ ] Add **CSRF protection** for cookie-based sessions (or document and justify header-based sessions, but this conflicts with non-negotiable spec).
- [ ] Add password hashing with **argon2id** (or bcrypt cost >= 12+) and implement lockout after 5 failed attempts.
- [ ] Enforce strict **rate limiting** targets per prefix (`/auth/*` 5/min, `/api/*` 60/min).
- [ ] Strict Helmet configuration (CSP, HSTS, XFO DENY, nosniff).
- [ ] Implement input validation with **Zod** on all endpoints.
- [ ] Verify “MCP” never appears in user-facing UI. Also ensure backend messages won’t leak to UI.

### P1 (strongly recommended)
- [ ] Add integration consent modal + permission scopes + approval modes.
- [ ] Add sandbox/timeouts/circuit breakers for integration operations.
- [ ] Add PII scrubbing to logs and audit entries.
- [ ] Confirm structured logging (Pino) and Sentry privacy toggle.

### P2 (hardening / completeness)
- [ ] Upload MIME magic-byte validation and safe storage.
- [ ] Ensure secret handling uses keychain (desktop) and env (server) only, with fail-closed behavior.
- [ ] Add security.txt and disclosure policy (SECURITY.md already exists; verify security.txt integration if deployed).

---

## 7) Notes on “MCP” Terminology (UX Safety)
The current backend contains the route:
- `POST /api/connectors/mcp/connect`

and error messaging references “Failed to connect to MCP server”.

**Requirement**
- The word **“MCP” must NEVER appear in user-facing UI**.
- Ensure frontend error mapping replaces internal terms with “Connections” and friendly text, and ensure any error propagation paths sanitize that wording.

---

## 8) Conclusion
VIMO already implements several foundation elements (helmet/cors, rate limiting presence, credential encryption at rest, centralized request auth gating, and audit log storage). However, to meet the stated non-negotiable security architecture and defense-in-depth requirements—especially for team/cloud deployments—the authentication/authorization model, CSRF, strict rate limiting, Zod validation, RBAC enforcement, integration consent/sandboxing, and privacy-preserving logging need to be implemented or verified.

This audit file serves as the baseline checklist for remediation work.
