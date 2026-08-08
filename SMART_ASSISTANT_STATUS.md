# Smart Assistant — Status

> Status: **Core shipped** (verified 2026-08-08). The Smart Assistant is the
> floating chat panel (`VimoAssistant.tsx`) backed by `POST /api/assistant/message`
> and the `vimoAssistantAgent`. Users see **Smart Assistant** only — never "AI
> provider", "LLM", "API key", or "model" terminology in normal UI (enforced by
> `scripts/check-banned-words.mjs`). Items below are unchecked until verified.

## Current Goal

Build VIMO **"Smart Assistant"** (user-facing name) that provides helpful writing, translation, suggestions, and chat—**under the hood it routes through AI integrations**. Users never see "AI provider", "LLM", "API key", or "model" terminology in normal UI.

## Progress

- [x] Floating chat panel (bottom-right) with action invocation + approval prompt — `VimoAssistant.tsx`, `POST /api/assistant/message`
- [x] Backend agent routing with tool invocation + navigation targets — `vimoAssistantAgent.ts`
- [x] Settings → AI provider connection cards (Local AI + Cloud AI, friendly labels) — `SettingsPage` AI provider management
- [x] Onboarding LLM step with provider presets + "Local" badge for Ollama + "Skip for now" — `OnboardingLLMSetup.tsx`
- [x] Best-time-to-post predictor (ties into analytics) — `postingTimeService.ts` + `POST /api/scheduled-posts/suggest-time`
- [ ] Post composer caption helper ("Write this for me") + inline tone refinement buttons — not present as inline composer UI (post writing goes through the Assistant chat / Content page)
- [ ] Hashtag suggester surfaced in composer — backend `generateHashtagsTool` exists; no composer button verified
- [ ] Engagement inbox reply suggester — not verified
- [ ] Dashboard widget: content ideas — not verified (Dashboard shows activity/autopilot feeds instead)
- [ ] Translate button (multi-language) — not implemented

## Integration / Provider Plan (Under the hood)

- [x] AI provider abstraction — `llmProvider.ts` (`getActiveLLMProvider`, `callWithProviderChain`, `resolveModelName`)
- [x] Local Ollama support: default base URL `http://localhost:11434`, model `llama3` — `llmProvider.ts`
- [x] Provider fallback chain — `callWithProviderChain` (try next configured provider on failure)
- [ ] Ollama auto-detection on first launch + one-click setup prompt — auto-detection not verified; onboarding offers manual "Local" choice
- [ ] "🔒 Fully private — runs on your computer" badge — not verified (onboarding copy explains Local = "nothing ever leaves your computer")
- [ ] Model download flow with progress (`ollama pull` via backend) — not implemented

## OAuth / Credentials (No hosted VIMO AI gateway)

- [x] Local AI mode: runs fully on the user machine (no prompts leaving device) — via Local provider
- [x] Cloud AI mode: user provides API key via Settings UI and it is validated then encrypted and stored in SQLite — credential store AES-256-GCM
- [ ] Privacy toggle ("Don't send my content to cloud AI" forces Ollama-only) — not implemented as a toggle

## Error Handling & Fallback

- [x] Provider chain fallback if a cloud provider is down — `callWithProviderChain`
- [x] Friendly empty state when no AI configured — onboarding "Pick your AI brain" + "Skip for now" path
- [ ] Human-friendly error copy with zero technical terms on provider failure — `llmErrorHandler.ts` exists; UI copy not fully verified
- [ ] If Ollama model isn't downloaded: prompt to download with progress — not implemented

## Privacy / Logging

- [ ] Never log AI prompts/responses by default — not verified
- [ ] PII-safe logging/audit entries only (friendly summaries, not raw content) — not verified

## Onboarding Integration

- [x] First-run wizard: "Pick your AI brain" step with Local/Cloud presets + skip — `OnboardingLLMSetup.tsx`
- [ ] Ollama auto-detect → one-click setup or skip — not implemented (manual selection only)

## Naming Constraints (must never break)

- [x] UI labels use **Smart Assistant** only
- [x] Enforced by `scripts/check-banned-words.mjs` (bans "LLM", "API key", "OAuth", "PKCE", "MCP", "webhook" etc. from user-facing strings)
