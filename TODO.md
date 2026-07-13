# VIMO Hardening: Instagram Graph API + Growth Intelligence

## Section 1: Real Instagram Graph API Publisher
- [ ] Create `packages/backend/src/connectors/handlers/instagramHandler.ts` implementing:
  - [ ] `verifyAccountType`
  - [ ] `createMediaContainer`
  - [ ] `publishMediaContainer` (poll up to 5 minutes)
  - [ ] `publishPost` (error mapping + scheduledPosts update + socket event)
- [ ] Update `packages/backend/src/services/schedulerService.ts`:
  - [ ] Replace simulation publishing with real Instagram handler calls
  - [ ] Resolve connector selection using **first active connector for the platform** (until DB linkage exists)
  - [ ] Update scheduled post status + metadataJson with platformPostId/permalink or error
  - [ ] Rate-limit reschedule (+1 hour) and token-expired handling (connector status + socket event)

## Section 2: Instagram OAuth Flow (Real Implementation)
- [ ] Update `packages/backend/src/connectors/presets/index.ts` for Instagram:
  - [ ] `authType: 'oauth2_manual'`
  - [ ] requiredCredentials: appId, appSecret, accessToken
- [ ] Add backend route `GET /api/connectors/instagram/verify`
  - [ ] Read Instagram connector credentials from credential store
  - [ ] Call `verifyAccountType`
  - [ ] Return `{ accountType, username, followersCount, mediaCount, canPost }` (+ instructions when personal)
- [ ] Update frontend Instagram ConnectorSetupModal:
  - [ ] After Test, call `/api/connectors/instagram/verify`
  - [ ] Show green success box or red prominent warning box

## Section 3: Optimal Posting Time Engine
- [ ] Create `packages/backend/src/services/postingTimeService.ts`
  - [ ] `getInstagramAudienceInsights` (insights API + parse best day/hour)
  - [ ] `getDefaultOptimalTimes`
  - [ ] `suggestPostingTime` (over-posting penalty: avoid <3h on same platform)
- [ ] Add backend route `POST /api/scheduled-posts/suggest-time`
- [ ] Update frontend `packages/frontend/src/pages/ContentPage.tsx`:
  - [ ] Add “Suggest best time” button + card
  - [ ] “Use this time” populates date/time picker

## Section 4: Post Performance Tracker
- [ ] Create `packages/backend/src/services/performanceTrackerService.ts`
  - [ ] `fetchInstagramPostInsights`
  - [ ] `refreshPostPerformance` (cron: every 6 hours)
- [ ] Update backend startup `packages/backend/src/index.ts`:
  - [ ] Add `node-cron` schedule `0 */6 * * *`
- [ ] Update `packages/backend/src/services/analyticsService.ts`:
  - [ ] Replace mock metrics with stored metadataJson metrics where available
- [ ] Run validation:
  - [ ] `npx tsc --noEmit` in both `packages/backend` and `packages/frontend`
  - [ ] `npm run dev` and verify:
    - [ ] scheduled post triggers BullMQ worker
    - [ ] Instagram handler API calls appear in logs
