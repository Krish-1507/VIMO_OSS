---
"vimo-oss": patch
---

The launcher can finally update itself: `vimo --update` now refreshes the launcher from npm first (re-executing into the new copy) and then the app with a forced reinstall + rebuild, so `npm i -g vimo-oss` plus `vimo --update` can never get stuck on a stale version again. Also hardens interrupted downloads (copy fallback instead of losing the install), warns when `--update` is pointed at a user-owned checkout, and fails fast with a clear message when no unpack tool exists.
