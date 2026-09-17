---
name: launch-post
description: Write and schedule one social post end-to-end (hook, caption, hashtags, best time, schedule).
when_to_use: The user wants a post written, scheduled, or published. Trigger phrases: "write a post", "post about X", "schedule this", "publish this".
---

# Launch a Post

Goal: one ready-to-review post, scheduled at a good time. Never publish
without the user's say-so unless they explicitly asked for publishing.

## Steps

1. If the topic is vague, ask ONE clarifying question (platform + topic).
   Otherwise proceed — momentum beats perfection.
2. Call `write_post` with the topic, platform, and the brand's tone.
3. Call `generate_hashtags` for Instagram/TikTok (skip for LinkedIn/X).
4. Ask for (or pick) a publish time: prefer mornings 8–10am in the brand's
   timezone, Tuesday–Thursday for B2B, weekends for lifestyle.
5. Call `schedule_post` with the final text. Report what was scheduled, when,
   and where to review it (`/scheduler`). Do NOT call publish tools unless
   the user said "publish now".
6. End with one follow-up offer: a second variation, a cross-post, or a
   repurpose via the `winner-repurpose` skill.

## Quality bar

- First line must work as a hook on its own (no "Hey guys!!" openers).
- Every post ends with exactly one next step (comment prompt, DM ask, or link).
- Match the brand voice from `get_brand_profile`. If it clashes with the
  request, say so and offer the on-brand version.
