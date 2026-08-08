---
"@vimo/backend": minor
"@vimo/frontend": minor
---

Phase 2 — autonomy guardrails, real YouTube/TikTok/Pinterest publishing, multi-account targeting, webhooks.

- **YouTube / TikTok / Pinterest now publish for real** — replaced the "connect-only"
  stubs with real handlers (`services/platformPublishers.ts`): YouTube resumable
  upload, TikTok Content Posting API (init + status polling, SELF_ONLY privacy by
  default), Pinterest v5 (board resolution + pin creation). All three are now
  marked `ready` in the connector presets. Errors map to plain-English messages —
  no token/API details ever leak to the UI.
- **Pick which account publishes** — `scheduled_posts.social_account_id` (migration
  003) lets a post target a specific connected account per platform. The schedule
  modal shows a "Publish as" dropdown (Auto = first connected account).
- **Autopilot guardrails** — new `max_posts_per_day` and `spend_cap_per_day`
  session fields (migration 003). The scheduler never assigns more than
  `max_posts_per_day` posts to a single day (shifts to the next day), and content
  creation pauses once the daily AI spend cap is reached. Autopilot LLM usage is
  now attributed per session (`llm_usage.related_entity_id`).
- **Run next week now** — `POST /api/autopilot/:id/run-now` runs one content
  cycle for the next week on an active session, honoring both guardrails. The
  Autopilot page shows a "Run next week now" button while monitoring.
- **Embeddings** — `llmProvider.embedText` (Ollama native + OpenAI-compatible
  fallback) and a real `llm_embed` handler so the declared LLM tools actually work
  through the tool router (`llm_complete` + `llm_embed` now registered).
- **Webhooks** — `POST /api/webhooks/config`, `GET /api/webhooks/events`,
  `POST /api/webhooks/fire-test`, and a receiving endpoint. `post_published` and
  `post_failed` events fire from the scheduler; delivery history is stored in
  `webhook_events`. Settings → Notifications gains a Webhooks card (URL, optional
  HMAC-SHA256 secret, test button, delivery history).
