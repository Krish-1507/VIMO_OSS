---
"@vimo/backend": minor
"@vimo/frontend": minor
---

The VIMO Assistant is now a real agent panel — Cursor for marketing.

**Frontend**
- The assistant opens as a docked side panel that PUSHES the app content aside (VS Code / Cursor style) instead of floating over it. Full-screen sheet on mobile, drag-to-resize width on desktop, Esc / Ctrl+K to toggle.
- Live streaming: responses appear token-by-token over Socket.IO with a typing cursor.
- Visible tool activity: every tool the agent runs shows as a live row (spinner → ✓/✗ with a summary, expandable args), so you always see what VIMO is doing.
- Markdown rendering (headings, lists, bold, code, links) via a tiny dependency-free renderer; copy button on every answer; Stop button that aborts the run server-side; new-conversation button; smarter composer (auto-grow, Shift+Enter).

**Backend**
- New `POST /api/assistant/chat` kicks off an agentic run and streams progress (`delta` / `tool_start` / `tool_result` / `done` / `error`) over `assistant:event`; `POST /api/assistant/stop` aborts it. Legacy `/message` endpoint unchanged.
- Agent loop deepened to 14 steps; all 31 tools now operate on the ACTIVE brand instead of the first row.
- Fixed a product-wide LLM blocker: @ai-sdk provider packages were v3-spec while the app runs ai@4 — every cloud LLM call was failing silently. Pinned to spec-v1 providers.
- Pollinations anonymous tier no longer supports SSE and its free budget is effectively gone: the built-in provider now runs non-streaming behind the scenes, empty responses are treated as failures, and users get clear one-minute fixes (one-click Ollama local AI, or a free Groq/Google key).
