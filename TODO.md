# VIMO Hardening: Instagram Graph API + Growth Intelligence

> Status: **Completed** (verified 2026-08-08). All sections below are implemented
> and passing `npx tsc --noEmit` in both packages. Kept as an implementation record.

## Section 1: Real Instagram Graph API Publisher

- [x] Create `packages/backend/src/connectors/handlers/instagramHandler.ts` implementing:
  - [x] `verifyAccountType`
  - [x] `createMediaContainer`
  - [x] `publishMediaContainer` (poll up to 5 minutes)
  - [x] `publishPost` (error mapping + scheduledPosts update + socket event)
- [x] Update `packages/backend/src/services/schedulerService.ts`:
  - [x] Replace simulation publishing with real Instagram handler calls
  - [x] Resolve connector selection using **first active connector for the platform** (until DB linkage exists)
  - [x] Update scheduled post status + metadataJson with platformPostId/permalink or error
  - [x] Rate-limit reschedule (+1 hour) and token-expired handling (connector status + socket event)

## Section 2: Instagram OAuth Flow (Real Implementation)

- [x] Update `packages/backend/src/connectors/presets/index.ts` for Instagram:
  - [x] `authType: 'oauth2_manual'`
  - [x] requiredCredentials: appId, appSecret, accessToken
- [x] Add backend route `GET /api/connectors/instagram/verify`
  - [x] Read Instagram connector credentials from credential store
  - [x] Call `verifyAccountType`
  - [x] Return `{ accountType, username, followersCount, mediaCount, canPost }` (+ instructions when personal)
- [x] Update frontend Instagram ConnectorSetupModal:
  - [x] After Test, call `/api/connectors/instagram/verify`
  - [x] Show green success box or red prominent warning box

## Section 3: Optimal Posting Time Engine

- [x] Create `packages/backend/src/services/postingTimeService.ts`
  - [x] `getInstagramAudienceInsights` (insights API + parse best day/hour)
  - [x] `getDefaultOptimalTimes`
  - [x] `suggestPostingTime` (over-posting penalty: avoid <3h on same platform)
- [x] Add backend route `POST /api/scheduled-posts/suggest-time`
- [x] Update frontend `packages/frontend/src/pages/ContentPage.tsx`:
  - [x] Add "Suggest best time" button + card
  - [x] "Use this time" populates date/time picker

## Section 4: Post Performance Tracker

- [x] Create `packages/backend/src/services/performanceTrackerService.ts`
  - [x] `fetchInstagramPostInsights`
  - [x] `refreshPostPerformance` (cron: every 6 hours)
- [x] Update backend startup `packages/backend/src/index.ts`:
  - [x] Add `node-cron` schedule `0 */6 * * *`
- [x] Update `packages/backend/src/services/analyticsService.ts`:
  - [x] Replace mock metrics with stored metadataJson metrics where available
- [x] Run validation:
  - [x] `npx tsc --noEmit` in both `packages/backend` and `packages/frontend`
  - [x] `npm run dev` and verify:
    - [x] scheduled post triggers BullMQ worker
    - [x] Instagram handler API calls appear in logs
