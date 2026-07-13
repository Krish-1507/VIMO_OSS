# SMART_ASSISTANT_STATUS.md

## Current Goal

Build VIMO **“Smart Assistant”** (user-facing name) that provides helpful writing, translation, suggestions, and chat—**under the hood it routes through AI integrations**. Users never see “AI provider”, “LLM”, “API key”, or “model” terminology in normal UI.

## Progress

- [ ] UI component foundations for integrations exist (from earlier “Integrations” + “AI Designer” work)
- [ ] Smart Assistant page/sections to be added:
  - [ ] Settings → Smart Assistant (Local AI + Cloud AI connection cards)
  - [ ] Post composer caption helper (“✨ Write this for me”) + hashtag suggester + tone refinement buttons
  - [ ] Engagement inbox reply suggester
  - [ ] Dashboard widget: content ideas
  - [ ] Best-time-to-post predictor (ties into analytics)
  - [ ] Translate button (multi-language)
  - [ ] Optional floating chat panel (bottom-right) with action invocation + approval prompt

## Integration / Provider Plan (Under the hood)

- [ ] Create AI integration bundle(s) under `packages/integrations/`:
  - [ ] openai, anthropic, gemini, ollama, groq, openrouter, mistral, replicate
- [ ] Implement AIProvider abstraction:
  - [ ] Provider selector: default = local Ollama (recommended) when available
  - [ ] Actions: `generate_text`, `generate_chat`, `generate_image` (where supported), `embed`, `list_models`
- [ ] Implement local Ollama auto-detection:
  - [ ] On first launch, check `localhost:11434`
  - [ ] Friendly one-click setup prompt if detected
  - [ ] If not detected: in-app guide with platform download steps + curated model download buttons (run `ollama pull` via backend endpoint and show progress)
  - [ ] Show “🔒 Fully private — runs on your computer” badge when in Local AI mode

## OAuth / Credentials (No hosted VIMO AI gateway)

- [ ] Local AI mode: runs fully on the user machine (no prompts leaving device)
- [ ] Cloud AI mode: user provides API key via Settings UI and it is validated then encrypted and stored in SQLite
- [ ] Privacy toggle:
  - [ ] “Don’t send my content to cloud AI” forces Ollama-only behavior

## Error Handling & Fallback

- [ ] If no AI configured: all AI features use friendly empty states with one-click CTA “Enable Smart Assistant”
- [ ] If selected cloud provider is down:
  - [ ] auto-fallback to next configured provider
  - [ ] notify user with human-friendly copy (no technical terms)
- [ ] If Ollama model isn’t downloaded:
  - [ ] prompt to download with progress

## Privacy / Logging

- [ ] Never log AI prompts/responses by default
- [ ] Add PII-safe logging/audit entries only (friendly summaries, not raw content)

## Onboarding Integration

- [ ] After social connect in first-run wizard:
  - [ ] “Want a Smart Assistant… We recommend free local AI.”
  - [ ] Ollama auto-detect → one-click setup or skip

## Naming Constraints (must never break)

- [ ] UI labels must use **Smart Assistant** only
