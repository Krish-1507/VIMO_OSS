---
name: pillar-plan
description: Build 3–5 content pillars with ratios and a 30-day rotation so the brand never wonders what to post.
when_to_use: Content strategy questions, "what should I post", "plan my content", inconsistent posting, new brand setup.
---

# Pillar Plan

Goal: a concrete pillar system the user can follow for 30 days.

## Steps

1. Call `get_brand_profile` for industry, audience, and voice.
2. Propose 3–5 pillars, each with: name, the buyer question it answers, and
   a share of output. Default ratio: 40% educate, 30% entertain, 20%
   inspire, 10% promote. At least one pillar must be evergreen (searchable
   months from now).
3. Sanity-check each pillar: could it produce 10 distinct posts a month
   without repeating itself? If not, broaden it.
4. Lay out a weekly rotation (e.g. Mon educate, Tue entertain, Wed educate,
   Thu inspire, Fri promote) at a cadence the user can sustain — 3–5
   posts/week beats 7/week for 3 weeks then silence.
5. Offer to generate the first week immediately (3 posts via `write_post`,
   then `schedule_post` for each after approval).
6. Set the review expectation: revisit pillar performance every 30 days,
   change at most one pillar per month.

## Quality bar

- Pillars overlap enough that one viewer would enjoy all of them.
- Every pillar ties to a buyer question in the buyer's own words, not jargon.
- Never propose more than 5 pillars. Constraint is the feature.
