/**
 * Usage Routes — AI cost tracking endpoints.
 */

import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { llmUsage } from '../db/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { formatError } from '../lib/errorFormatter';
import { TaskType, estimateTaskCost, MODEL_CAPABILITIES, resolveModelId, TASK_TYPE_LABELS, getModelForTask } from '../lib/modelRouter';

export default async function usageRoutes(app: FastifyInstance) {
  /**
   * GET /api/usage/costs — aggregate cost breakdown
   * Query: period (today | this_week | this_month | all_time)
   */
  app.get('/api/usage/costs', async (request, reply) => {
    try {
      const { period, brandProfileId } = request.query as {
        period?: string;
        brandProfileId?: string;
      };

      let startDate: string | undefined;
      const now = new Date();

      switch (period || 'this_month') {
        case 'today': {
          const d = new Date(now);
          d.setHours(0, 0, 0, 0);
          startDate = d.toISOString();
          break;
        }
        case 'this_week': {
          const d = new Date(now);
          d.setDate(d.getDate() - d.getDay());
          d.setHours(0, 0, 0, 0);
          startDate = d.toISOString();
          break;
        }
        case 'this_month': {
          const d = new Date(now.getFullYear(), now.getMonth(), 1);
          startDate = d.toISOString();
          break;
        }
        case 'all_time':
        default:
          startDate = undefined;
          break;
      }

      // Build conditions
      const conditions: any[] = [];
      if (startDate) {
        conditions.push(gte(llmUsage.createdAt, startDate));
      }
      if (brandProfileId) {
        conditions.push(eq(llmUsage.brandProfileId, brandProfileId));
      }

      const allRecords = conditions.length > 0
        ? db.select().from(llmUsage).where(and(...conditions)).all()
        : db.select().from(llmUsage).all();

      // Aggregate
      let totalCostUSD = 0;
      const byTaskType: Record<string, number> = {};
      const byProvider: Record<string, number> = {};
      const byDay: Record<string, number> = {};

      let mostExpensiveTask: { taskType: string; cost: number; date: string } | null = null;

      for (const record of allRecords) {
        totalCostUSD += record.costUSD;

        byTaskType[record.taskType] = (byTaskType[record.taskType] || 0) + record.costUSD;
        byProvider[record.provider] = (byProvider[record.provider] || 0) + record.costUSD;

        const day = record.createdAt.split('T')[0];
        byDay[day] = (byDay[day] || 0) + record.costUSD;

        if (!mostExpensiveTask || record.costUSD > mostExpensiveTask.cost) {
          mostExpensiveTask = {
            taskType: record.taskType,
            cost: record.costUSD,
            date: record.createdAt,
          };
        }
      }

      // Convert byDay to sorted array
      const byDayArray = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, cost]) => ({ date, cost }));

      return {
        totalCostUSD: Math.round(totalCostUSD * 1000000) / 1000000,
        byTaskType,
        byProvider,
        byDay: byDayArray,
        mostExpensiveTask,
        recordCount: allRecords.length,
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  /**
   * GET /api/usage/estimate — estimate cost before running tasks
   * Query: taskType, count (number of operations)
   */
  app.get('/api/usage/estimate', async (request, reply) => {
    try {
      const { taskType, count } = request.query as {
        taskType?: string;
        count?: string;
      };

      if (!taskType || !Object.values(TaskType).includes(taskType as TaskType)) {
        return reply.status(400).send({
          error: 'Invalid taskType. Valid values: ' + Object.values(TaskType).join(', '),
        });
      }

      const taskCount = Math.max(1, parseInt(count || '1', 10));

      // Get current model assignment for this task
      let modelId = 'gpt-4o-mini';
      let provider = 'openai';
      try {
        const route = await getModelForTask(taskType as TaskType);
        modelId = route.modelId;
        provider = route.provider;
      } catch {
        // Fallback to defaults
      }

      const costs = estimateTaskCost(taskType as TaskType);
      const modelInfo = MODEL_CAPABILITIES[modelId] || MODEL_CAPABILITIES['gpt-4o-mini']!;
      const perCallCost = (modelInfo.inputCostPer1K + modelInfo.outputCostPer1K) / 2 * 0.5; // rough: 500 tokens avg

      return {
        taskType,
        taskTypeLabel: TASK_TYPE_LABELS[taskType as TaskType] || taskType,
        currentModel: modelId,
        currentProvider: provider,
        estimatedCostPerTaskUSD: Math.round(perCallCost * 1000000) / 1000000,
        estimatedCostForCountUSD: Math.round(perCallCost * taskCount * 1000000) / 1000000,
        count: taskCount,
        comparison: {
          cheapest: costs.cheapest,
          standard: costs.standard,
          premium: costs.premium,
        },
      };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });

  /**
   * POST /api/usage/record — manually record usage (internal)
   */
  app.post('/api/usage/record', async (request, reply) => {
    try {
      const body = request.body as any;
      const crypto = await import('crypto');

      await db.insert(llmUsage).values({
        id: crypto.randomUUID(),
        taskType: body.taskType || 'UNKNOWN',
        provider: body.provider || 'unknown',
        modelId: body.modelId || 'unknown',
        inputTokens: body.inputTokens || 0,
        outputTokens: body.outputTokens || 0,
        costUSD: body.costUSD || 0,
        brandProfileId: body.brandProfileId || null,
        relatedEntityId: body.relatedEntityId || null,
        relatedEntityType: body.relatedEntityType || null,
        createdAt: new Date().toISOString(),
      });

      return { success: true };
    } catch (err) {
      return reply.status(500).send(formatError(err));
    }
  });
}
