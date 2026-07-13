# AI_DESIGNER_STATUS.md

## Current Goal

Build **“✨ AI Designer”** as an **Integration** (Canva Connect under the hood), delivering a one-button magic UX for non-technical users.

## Progress

- [x] Composer UI button + modal scaffolding added to `packages/frontend/src/pages/ContentPage.tsx` (uses placeholder action invoke responses)
- [x] Backend integrations plumbing exists (`/api/integrations/*`) with a mock Canva integration implementation (`create_design_from_prompt`)
- [x] Wire to real Canva Connect integration via MCP-backed Integration Engine
- [x] Multi-platform resize + “Resizing for Instagram, X, LinkedIn…” checkmarks
- [x] “Edit in Canva” deep link
- [x] Recent designs drawer + brand kit selector
- [x] Proper permission prompt and action preview gating (“Allow VIMO to…”)
- [x] Add fallback behavior: if Canva integration unavailable → use AI provider image generation

## Non-Negotiable UX Constraints (must always hold)

- Never show the word “MCP” in user-facing UI.
- Feature is always called **AI Designer** (marketing speak).
- “Connect” and “Connected” must be one-click with browser popup for real OAuth.
