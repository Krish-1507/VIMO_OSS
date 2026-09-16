---
"@vimo/frontend": patch
---

Fix the guided OAuth setup trapping users on step 1: the footer showed a disabled "Save & Connect" on every step (instead of "Next Step") because the visibility check looked at all steps instead of the current one. Save now exists only on the final step, credential placeholders are never shown as copyable values, PKCE providers no longer ask for a secret they don't need, and pasted values are trimmed before saving.
