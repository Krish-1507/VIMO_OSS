---
name: weekly-review
description: Monday-morning review: what worked, what didn't, and the 3 highest-leverage actions for this week.
when_to_use: "weekly review", "how did we do", Monday check-ins, "what should I focus on this week".
---

# Weekly Review

Goal: three actions, ranked, with the data behind each.

## Steps

1. Call `get_analytics` (last 7 days) and `get_top_content`. Compare
   against the prior week in plain language — direction matters more than
   absolutes.
2. Score the week against the brand's pillars (if known): which pillar
   earned its keep, which one is coasting on hope.
3. Measure signal, not vanity: saves, shares, replies, profile visits, and
   anything that smells like buying intent outrank likes and follower count.
4. Output exactly 3 actions for this week: one double-down (more of a
   winner), one fix (repair the weakest link), one experiment (the 30% —
   small, cheap, learnable). Each with the metric that will judge it.
5. Offer to execute all three now (drafts via `write_post`, scheduling via
   `schedule_post`, tracking via the next weekly review).
6. Call `save_lesson` with the week's pattern so the brand memory compounds.

## Quality bar

- Three actions, not ten. Constraint is kindness.
- Every recommendation cites the number that earned it.
- If the data is thin (new account, quiet week), say so and prescribe the
   cheapest signal-generating week instead of inventing conclusions.
