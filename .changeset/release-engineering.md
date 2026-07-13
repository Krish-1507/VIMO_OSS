---
"@vimo/backend": patch
"@vimo/frontend": patch
"@vimo/shared": patch
---

Add automated release engineering: Changesets now drive versioning and the
changelog, so package versions are never bumped by hand. CI now builds the
app (`tsc` + `vite build`) instead of only type-checking, so a green pipeline
means the app actually compiles and bundles.
