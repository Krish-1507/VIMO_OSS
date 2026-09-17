---
name: winner-repurpose
description: Turn a proven top post into variations and cross-posts. Double down on winners, don't chase new ideas.
when_to_use: After a post performs well, "make more like this", "repurpose this", weekly review follow-ups. Pairs with the 70/30 proven/experimental split.
---

# Winner Repurpose

Goal: squeeze 3–5 assets out of one proven winner.

## Steps

1. Call `get_top_content` to identify the winner (or use the post the user
   named). Note WHY it worked: hook pattern, format, topic, emotion.
2. Create 3 variations that keep the winning structure but change one
   variable each (hook, example, format). Use `write_post` for each.
3. Create 1 cross-platform adaptation (e.g. carousel → short script, post →
   thread). Match each platform's native format.
4. Present all drafts together with the lesson learned ("hook X + format Y
   works for this audience"), then offer to schedule the batch.
5. Call `save_lesson` with the pattern so the brand memory compounds —
   next month's agent should know this without being told.

## Quality bar

- Never copy-paste the winner verbatim to another platform. Adapt natively.
- Change one variable per variation so results stay learnable.
- If nothing has proven itself yet, say so and propose the cheapest test
  instead of repurposing a guess.
