/**
 * Growth Loop Service
 *
 * Queries qualifying published posts and runs the autonomous growth loop
 * for each one. Used by the cron job scheduler.
 */

import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import { runGrowthLoop } from '../agents/growthLoopAgent';

/**
 * Compatibility export used by analytics routes.
 * Returns a minimal, type-safe payload until the full growth-insights pipeline is wired.
 */
export async function analyzeTopPerformingContent(brandProfileId: string): Promise<{
  brandProfileId: string;
  topPostTopics: string[];
  summary: string;
}> {
  // TODO: Replace with real query-based analysis using scheduledPosts + historical performance.
  return {
    brandProfileId,
    topPostTopics: [],
    summary: 'Top-performing content analysis is not yet configured.',
  };
}

/**
 * Run the growth loop for all brands.
 * Queries scheduledPosts where status is 'published', publishedAt is between
 * 6 hours ago and 7 days ago, and isHighPerformerChecked is null or false.
 * For each qualifying post, calls runGrowthLoop and then marks it as checked.
 */
export async function runGrowthLoopForAllBrands(): Promise<void> {
  console.log('[GrowthLoopService] Starting growth loop for all brands...');

  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all qualifying posts
    const allPosts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.status, 'published'),
          gte(scheduledPosts.scheduledAt, sevenDaysAgo),
          lte(scheduledPosts.scheduledAt, sixHoursAgo),
        ),
      )
      .all();

    // Filter in JS for isHighPerformerChecked (SQLite may have null handling differences)
    const qualifyingPosts = allPosts.filter((post) => {
      const checked = post.isHighPerformerChecked;
      return checked === null || checked === 0;
    });

    if (qualifyingPosts.length === 0) {
      console.log('[GrowthLoopService] No qualifying posts found for growth loop.');
      return;
    }

    console.log(`[GrowthLoopService] Found ${qualifyingPosts.length} qualifying posts. Processing...`);

    for (const post of qualifyingPosts) {
      try {
        await runGrowthLoop(post.id);

        // Mark as checked after processing
        await db
          .update(scheduledPosts)
          .set({
            isHighPerformerChecked: 1,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(scheduledPosts.id, post.id))
          .run();

        console.log(`[GrowthLoopService] Post ${post.id} processed and marked as checked.`);
      } catch (err) {
        console.error(`[GrowthLoopService] Failed to process post ${post.id}:`, (err as Error).message);
        // Still mark as checked so we don't retry indefinitely on errors
        try {
          await db
            .update(scheduledPosts)
            .set({
              isHighPerformerChecked: 1,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(scheduledPosts.id, post.id))
            .run();
        } catch {
          // ignore secondary errors
        }
      }
    }

    console.log(`[GrowthLoopService] Growth loop complete. Processed ${qualifyingPosts.length} posts.`);
  } catch (err) {
    console.error('[GrowthLoopService] Error running growth loop:', (err as Error).message);
    return;
  }
}
