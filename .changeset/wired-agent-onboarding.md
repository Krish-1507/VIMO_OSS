---
"@vimo/frontend": patch
"@vimo/backend": patch
---

Make the conversational Marketing Agent the front door and fix onboarding end-to-end.

- **Backend**: the assistant now acts on the ACTIVE brand (explicit choice → Default Brand setting → first brand) instead of always the first row, on both `/api/assistant/chat` and the legacy `/message` endpoint.
- **Frontend**: chat requests send the active brand id from the header picker.
- **Onboarding actually finishes**: the completion screen persists `complete-step('complete')` server-side (previously the wizard reappeared on every reload), shows LIVE status instead of hardcoded checkmarks with one-click fix CTAs, and offers "Meet your marketing agent" which opens the assistant on arrival.
- **Social connect rewritten** on the polling connection service — no more postMessage handshake that silently dropped successes, no timer leaks, honest routing for app-password platforms, cleanup on unmount. Brand setup gains a "Skip for now" escape hatch.
- **Agent discoverability**: dashboard "Don't click around — just tell VIMO" hero with one-click prompt chips, an "Ask VIMO ⌘K" sidebar entry, first-visit auto-open, and the previously dead InteractiveTour now shows once.
