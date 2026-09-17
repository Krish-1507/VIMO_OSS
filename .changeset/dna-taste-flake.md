---
"@vimo/frontend": patch
"@vimo/backend": patch
---

Fix website DNA analysis end-to-end and apply the design-taste pass.

- **Backend**: website crawler speaks with a browser User-Agent, retries https/http/www variants, and fails with typed reasons (blocked/not_found/timeout/unreachable/bad_url) so the UI can guide instead of dead-ending; analyze-dna surfaces those reasons; approval tests mock the platform boundary and carry realistic timeouts.
- **Frontend**: DNA analysis gets a 90s budget, staged progress, and a blocked-site recovery panel that carries the URL into manual mode (Settings + onboarding); single teal accent lock across assistant/onboarding/DNA; copy de-slopped; Settings icons replace emojis; key headlines tightened.
