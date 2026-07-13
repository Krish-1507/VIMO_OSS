import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { scheduledPosts } from '../db/schema';
import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';
import { TaskType, getModelForTask, recordLLMUsage, estimateTokenCount, calculateCost } from '../lib/modelRouter';
import { generateText } from 'ai';

export interface PostPerformanceData {
  totalPostsPublished: number;
  totalReach: number;
  totalEngagements: number;
  avgEngagementRate: number;
  byPlatform: Record<string, { posts: number; reach: number; engagements: number; topPost: string }>;
  byDayOfWeek: number[];
  byHourOfDay: number[];
  byDate: Record<string, number>;
}

export async function getPostPerformance(
  dateRange: { start: string; end: string },
  brandProfileId?: string
): Promise<PostPerformanceData> {
  const conditions = [
    eq(scheduledPosts.status, 'published'),
    gte(scheduledPosts.scheduledAt, dateRange.start),
    lte(scheduledPosts.scheduledAt, dateRange.end)
  ];
  if (brandProfileId) {
    conditions.push(eq(scheduledPosts.brandProfileId, brandProfileId));
  }

  const posts = await db.select().from(scheduledPosts).where(and(...conditions)).all();

  const totalPostsPublished = posts.length;
  let totalReach = 0;
  let totalEngagements = 0;

  const byPlatform: Record<string, { posts: number; reach: number; engagements: number; topPost: string }> = {};
  const byDayOfWeek = new Array(7).fill(0);
  const byHourOfDay = new Array(24).fill(0);
  const byDate: Record<string, number> = {};

  for (const post of posts) {
    const date = new Date(post.scheduledAt);
    const day = date.getDay();
    const hour = date.getHours();
    const dateStr = post.scheduledAt.split('T')[0];

    // Use real stored metrics from metadataJson if available
    const metadata = post.metadataJson ? JSON.parse(post.metadataJson) : {};
    const performance = metadata.performance;

    let reach: number;
    let engagements: number;

    if (performance && performance.likes !== undefined) {
      // Use real metrics from performance tracker
      reach = performance.reach ?? 0;
      engagements = (performance.likes ?? 0) + (performance.comments ?? 0) +
        (performance.saves ?? 0) + (performance.shares ?? 0);
    } else {
      // No performance data available yet - use zero values
      // These will update once the post receives engagement
      reach = 0;
      engagements = 0;
    }

    totalReach += reach;
    totalEngagements += engagements;

    if (!byPlatform[post.platform]) {
      byPlatform[post.platform] = { posts: 0, reach: 0, engagements: 0, topPost: '' };
    }

    byPlatform[post.platform].posts += 1;
    byPlatform[post.platform].reach += reach;
    byPlatform[post.platform].engagements += engagements;

    // Track top post by engagement
    const currentPlatformStats = byPlatform[post.platform];
    const currentTopPostEngagement = currentPlatformStats.posts === 1 
      ? engagements 
      : (currentPlatformStats.engagements / currentPlatformStats.posts);
    
    if (!currentPlatformStats.topPost || engagements >= currentTopPostEngagement) {
      currentPlatformStats.topPost = post.content.substring(0, 100) + '...';
    }

    byDayOfWeek[day] += engagements;
    byHourOfDay[hour] += engagements;
    byDate[dateStr] = (byDate[dateStr] || 0) + 1;
  }

  const avgEngagementRate = totalReach > 0 ? (totalEngagements / totalReach) * 100 : 0;

  return {
    totalPostsPublished,
    totalReach,
    totalEngagements,
    avgEngagementRate,
    byPlatform,
    byDayOfWeek,
    byHourOfDay,
    byDate,
  };
}

export async function generateInsightSummary(performanceData: PostPerformanceData,
  brandProfileId: string
): Promise<string> {
  const prompt = `You are a marketing analytics expert. Analyze this performance data and write a concise insight summary (3-4 bullet points) with specific, actionable recommendations. Focus on what is working and what should change. Data: ${JSON.stringify(
    performanceData
  )}`;

  const modelRoute = await getModelForTask(TaskType.ANALYTICS_INSIGHT).catch(() => null);

  const result = await callWithProviderChain(
    'analytics insights',
    async (provider, modelId) => {
      const { text } = await generateText({
        model: provider.chat(modelId),
        prompt,
      });
      return text.trim();
    },
    () => {
      // Generic fallback insights
      return `This week you published ${performanceData.totalPostsPublished} posts reaching ${performanceData.totalReach} people. Your engagement rate is ${performanceData.avgEngagementRate.toFixed(1)}%. Consider posting more content types that resonate with your audience and experiment with different posting times.`;
    },
    modelRoute ?? undefined
  );

  if (modelRoute) {
    const inputTokens = estimateTokenCount(prompt);
    const outputTokens = estimateTokenCount(result);
    recordLLMUsage({
      taskType: TaskType.ANALYTICS_INSIGHT,
      provider: modelRoute.provider,
      modelId: modelRoute.modelId,
      inputTokens,
      outputTokens,
      costUSD: calculateCost(modelRoute.modelId, inputTokens, outputTokens),
      brandProfileId,
      relatedEntityType: 'analytics_insight',
    });
  }

  return result;
}

export async function getWeeklyReport(brandProfileId: string): Promise<{ summary: string, highlights: string[], recommendations: string[], data: PostPerformanceData }> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);

  const data = await getPostPerformance({ start: start.toISOString(), end: end.toISOString() }, brandProfileId);
  const rawSummary = await generateInsightSummary(data, brandProfileId);

  const prompt = `You are a marketing analytics expert. Analyze this performance data.
Data: ${JSON.stringify(data)}
Return ONLY a JSON object with:
- summary: string (1 paragraph overview)
- highlights: string[] (2-3 key positive findings)
- recommendations: string[] (2-3 actionable next steps)`;

  let report = {
    summary: rawSummary,
    highlights: ['Data analysis completed.'],
    recommendations: ['Review the raw summary for details.']
  };

  try {
    const text = await callWithProviderChain(
      'analytics insights',
      async (provider, modelId) => {
        const { text: t } = await generateText({ model: provider.chat(modelId), prompt });
        return t;
      },
      () => JSON.stringify({
        summary: rawSummary,
        highlights: ['Data analysis completed.'],
        recommendations: ['Review the raw summary for details.']
      })
    );
    const cleanedText = text.replace(/^\`\`\`json/i, '').replace(/\`\`\`$/i, '').trim();
    const parsed = JSON.parse(cleanedText);
    report = { ...report, ...parsed };
  } catch (e) {
    console.error('Failed to parse weekly report JSON, falling back to raw text', e);
  }

  return {
    ...report,
    data
  };
}
