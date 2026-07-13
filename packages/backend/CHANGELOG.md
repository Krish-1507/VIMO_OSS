# @vimo/backend

## 1.1.0

### Minor Changes

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

### Patch Changes

- 4d1a3cc: Add automated release engineering: Changesets now drive versioning and the
  changelog, so package versions are never bumped by hand. CI now builds the
  app (`tsc` + `vite build`) instead of only type-checking, so a green pipeline
  means the app actually compiles and bundles.
