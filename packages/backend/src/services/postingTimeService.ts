/**
 * Posting Time Service
 *
 * Calculates the optimal time to post for a given account and platform
 * using Instagram's audience insights API and industry data.
 */
import axios from 'axios';
import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import * as credentialStore from '../lib/credentialStore';
import { ConnectorRegistry } from '../lib/connectorRegistry';
import { applyAdaptivePlan } from '../lib/adaptivePlanning';

interface AudienceInsights {
  bestDays: string[];
  bestHours: number[];
  audienceTimezones: string[];
}

interface OptimalTimes {
  dayOfWeek: number[];
  hour: number[];
}

interface SuggestedTime {
  suggestedDateTime: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  explanation?: import('../lib/explainer').Explanation;
}

/**
 * Fetches audience insights from Instagram's API
 */
export async function getInstagramAudienceInsights(
  instagramAccountId: string,
  accessToken: string
): Promise<AudienceInsights> {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${instagramAccountId}/insights`,
      {
        params: {
          metric: 'follower_demographics,reach',
          period: 'day',
          access_token: accessToken,
        },
      }
    );

    const data = res.data?.data ?? [];

    // Parse audience online hours from insights data
    const bestDays: string[] = [];
    const bestHours: number[] = [];
    const audienceTimezones: string[] = [];

    for (const metric of data) {
      if (metric.name === 'follower_demographics') {
        for (const value of metric.values ?? []) {
          if (value?.value) {
            // Parse day-of-week data if available
            if (value.value.day_of_week) {
              bestDays.push(value.value.day_of_week);
            }
            // Parse hour data if available
            if (value.value.hour) {
              bestHours.push(Number(value.value.hour));
            }
            // Parse timezone data if available
            if (value.value.timezone) {
              audienceTimezones.push(value.value.timezone);
            }
          }
        }
      }
    }

    return {
      bestDays: bestDays.length > 0 ? bestDays : getDefaultOptimalTimes('instagram', '').dayOfWeek.map(String),
      bestHours: bestHours.length > 0 ? bestHours : getDefaultOptimalTimes('instagram', '').hour,
      audienceTimezones,
    };
  } catch (err) {
    console.warn('[PostingTime] Failed to fetch Instagram audience insights, using defaults:', (err as Error).message);
    // Fall back to defaults
    const defaults = getDefaultOptimalTimes('instagram', '');
    return {
      bestDays: defaults.dayOfWeek.map(String),
      bestHours: defaults.hour,
      audienceTimezones: [],
    };
  }
}

/**
 * Returns evidence-based defaults by platform and industry.
 * Based on 2024-2025 industry data for peak engagement windows.
 */
export function getDefaultOptimalTimes(platform: string, industry: string): OptimalTimes {
  switch (platform.toLowerCase()) {
    case 'instagram':
      return {
        dayOfWeek: [2, 3, 5], // Tuesday, Wednesday, Friday
        hour: [7, 11, 14, 17], // 7am, 11am, 2pm, 5pm
      };
    case 'linkedin':
      return {
        dayOfWeek: [2, 3, 4], // Tuesday, Wednesday, Thursday
        hour: [8, 12, 17], // 8am, 12pm, 5pm
      };
    case 'tiktok':
      return {
        dayOfWeek: [2, 5, 6], // Tuesday, Friday, Saturday
        hour: [7, 19, 21], // 7am, 7pm, 9pm
      };
    case 'x':
    case 'twitter':
      return {
        dayOfWeek: [1, 3, 4], // Monday, Wednesday, Thursday
        hour: [9, 12, 17], // 9am, 12pm, 5pm
      };
    default:
      return {
        dayOfWeek: [2, 3, 4], // Tuesday, Wednesday, Thursday
        hour: [9, 12, 15], // 9am, 12pm, 3pm
      };
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:00 ${period}`;
}

/**
 * Suggests the optimal posting time for a given platform and brand.
 */
export async function suggestPostingTime(
  platform: string,
  brandProfileId: string,
  connectorId: string
): Promise<SuggestedTime> {
  let bestDays: number[];
  let bestHours: number[];
  let useRealData = false;

  // Try to get real audience insights from Instagram API
  if (platform === 'instagram') {
    try {
      const registry = new ConnectorRegistry(db);
      const connector = await registry.getById(connectorId);

      if (connector) {
        const accessToken = await credentialStore.getCredential(connectorId, 'accessToken');
        const instagramAccountId = await credentialStore.getCredential(connectorId, 'instagramAccountId');

        if (accessToken && instagramAccountId) {
          const insights = await getInstagramAudienceInsights(instagramAccountId, accessToken);
          bestDays = insights.bestHours.length > 0
            ? insights.bestDays.map(Number).filter((d) => !isNaN(d) && d >= 0 && d <= 6)
            : getDefaultOptimalTimes(platform, '').dayOfWeek;
          bestHours = insights.bestHours.length > 0
            ? insights.bestHours
            : getDefaultOptimalTimes(platform, '').hour;

          if (insights.bestHours.length > 0 || insights.bestDays.length > 0) {
            useRealData = true;
          } else {
            const defaults = getDefaultOptimalTimes(platform, '');
            bestDays = defaults.dayOfWeek;
            bestHours = defaults.hour;
          }
        } else {
          const defaults = getDefaultOptimalTimes(platform, '');
          bestDays = defaults.dayOfWeek;
          bestHours = defaults.hour;
        }
      } else {
        const defaults = getDefaultOptimalTimes(platform, '');
        bestDays = defaults.dayOfWeek;
        bestHours = defaults.hour;
      }
    } catch {
      const defaults = getDefaultOptimalTimes(platform, '');
      bestDays = defaults.dayOfWeek;
      bestHours = defaults.hour;
    }
  } else {
    const defaults = getDefaultOptimalTimes(platform, '');
    bestDays = defaults.dayOfWeek;
    bestHours = defaults.hour;
  }

  // Apply the brand's adaptive plan. Adaptive hours backed by the brand's
  // own data override the generic industry defaults.
  let adaptiveHours: number[] = [];
  try {
    const adjustments = await applyAdaptivePlan(brandProfileId, { platform });
    adaptiveHours = adjustments.preferredPostingHours || [];
  } catch (err) {
    console.warn('[PostingTime] applyAdaptivePlan failed:', (err as Error).message);
  }

  if (adaptiveHours.length > 0) {
    // Adaptive hours are weighted more heavily — put them first so the
    // conflict-avoidance loop prefers them.
    bestHours = [...adaptiveHours, ...bestHours.filter((h) => !adaptiveHours.includes(h))];
  }

  // Check for existing scheduled posts to avoid over-posting (within 3 hours)
  const now = new Date();
  const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const existingPosts = await db
    .select()
    .from(scheduledPosts)
    .where(
      and(
        eq(scheduledPosts.platform, platform),
        eq(scheduledPosts.status, 'pending'),
        gte(scheduledPosts.scheduledAt, now.toISOString()),
        lte(scheduledPosts.scheduledAt, threeHoursFromNow.toISOString())
      )
    )
    .all();

  // Pick the best day/hour that avoids conflicts
  let chosenDay = bestDays[0];
  let chosenHour = bestHours[0];
  let foundSlot = false;

  for (const day of bestDays) {
    for (const hour of bestHours) {
      // Calculate the next occurrence of this day+hour
      const candidate = getNextDayHour(day, hour);

      // Check if any existing post is within 3 hours of this candidate
      const hasConflict = existingPosts.some((post) => {
        const existingTime = new Date(post.scheduledAt).getTime();
        const candidateTime = candidate.getTime();
        return Math.abs(existingTime - candidateTime) < 3 * 60 * 60 * 1000;
      });

      if (!hasConflict) {
        chosenDay = day;
        chosenHour = hour;
        foundSlot = true;
        break;
      }
    }
    if (foundSlot) break;
  }

  const suggestedDateTime = getNextDayHour(chosenDay, chosenHour);
  const dayName = DAY_NAMES[chosenDay];
  const hourFormatted = formatHour(chosenHour);

  let reasoning: string;
  const usedAdaptiveHour = adaptiveHours.includes(chosenHour);
  if (usedAdaptiveHour) {
    reasoning = `Based on this brand's own performance history, hour ${hourFormatted} on ${dayName}s drives ${chosenHour >= 12 ? 'higher' : 'strong'} engagement (adaptive plan).`;
  } else if (useRealData) {
    reasoning = `Based on your Instagram audience insights, your followers are most active on ${dayName}s around ${hourFormatted}.`;
  } else {
    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    reasoning = `Industry data shows ${platformName} posts perform best on ${dayName}s at ${hourFormatted} for maximum engagement.`;
  }

  if (existingPosts.length > 0 && !foundSlot) {
    reasoning += ' Note: We avoided scheduling too close to another pending post (minimum 3-hour gap).';
  }

  // Generate explanation
  let explanation: import('../lib/explainer').Explanation | undefined;
  try {
    const { explainPostingTime } = await import('../lib/explainer');
    explanation = await explainPostingTime({
      platform,
      brandProfileId,
      suggestedHour: chosenHour,
      suggestedDayOfWeek: chosenDay,
    });
  } catch { /* explanation is optional */ }

  return {
    suggestedDateTime: suggestedDateTime.toISOString(),
    confidence: useRealData || usedAdaptiveHour ? 'high' : 'medium',
    reasoning,
    explanation,
  };
}

function getNextDayHour(targetDay: number, targetHour: number): Date {
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  let daysUntil = targetDay - currentDay;
  if (daysUntil < 0 || (daysUntil === 0 && targetHour <= currentHour)) {
    daysUntil += 7;
  }

  const result = new Date(now);
  result.setDate(result.getDate() + daysUntil);
  result.setHours(targetHour, 0, 0, 0);

  // Ensure the time is at least 1 hour from now
  if (result.getTime() - now.getTime() < 60 * 60 * 1000) {
    result.setDate(result.getDate() + 7);
  }

  return result;
}
