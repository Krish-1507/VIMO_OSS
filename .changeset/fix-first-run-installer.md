---
"vimo-oss": patch
---

Fix the first-run installer failing instantly on Windows ("Installing components didn't finish"): spawning npm.cmd now uses a shell as required by Node >= 18.20. Also quiets harmless startup warnings and clarifies installer error text.
