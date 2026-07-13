/**
 * Model Router — Multi-model routing and cost awareness
 *
 * Routes LLM calls to the best available model based on task type,
 * capability requirements, and user-configured model assignments.
 * Also provides cost estimation and tracking.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings, connectors } from '../db/schema';
import { getActiveLLMProvider } from './llmProvider';

/* ------------------------------------------------------------------ */
/*  Task Types                                                        */
/* ------------------------------------------------------------------ */

export enum TaskType {
  STRATEGY = 'STRATEGY',
  CONTENT_GENERATION = 'CONTENT_GENERATION',
  RESEARCH = 'RESEARCH',
  ENGAGEMENT_REPLY = 'ENGAGEMENT_REPLY',
  ANALYTICS_INSIGHT = 'ANALYTICS_INSIGHT',
  INTENT_CLASSIFICATION = 'INTENT_CLASSIFICATION',
  MEMORY_UPDATE = 'MEMORY_UPDATE',
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  [TaskType.STRATEGY]: 'Campaign Strategy',
  [TaskType.CONTENT_GENERATION]: 'Content Writing',
  [TaskType.RESEARCH]: 'Research & Discovery',
  [TaskType.ENGAGEMENT_REPLY]: 'Engagement Replies',
  [TaskType.ANALYTICS_INSIGHT]: 'Analytics Insights',
  [TaskType.INTENT_CLASSIFICATION]: 'Message Classification',
  [TaskType.MEMORY_UPDATE]: 'Memory & Learning',
};

/* ------------------------------------------------------------------ */
/*  Capability Levels                                                 */
/* ------------------------------------------------------------------ */

export enum ModelCapabilityLevel {
  PREMIUM = 'premium',
  STANDARD = 'standard',
  FAST = 'fast',
  LOCAL = 'local',
}

/* ------------------------------------------------------------------ */
/*  Task → minimum capability requirement                              */
/* ------------------------------------------------------------------ */

export const TASK_CAPABILITY_REQUIREMENTS: Record<TaskType, ModelCapabilityLevel> = {
  [TaskType.STRATEGY]: ModelCapabilityLevel.PREMIUM,
  [TaskType.CONTENT_GENERATION]: ModelCapabilityLevel.STANDARD,
  [TaskType.RESEARCH]: ModelCapabilityLevel.FAST,
  [TaskType.ENGAGEMENT_REPLY]: ModelCapabilityLevel.FAST,
  [TaskType.ANALYTICS_INSIGHT]: ModelCapabilityLevel.STANDARD,
  [TaskType.INTENT_CLASSIFICATION]: ModelCapabilityLevel.FAST,
  [TaskType.MEMORY_UPDATE]: ModelCapabilityLevel.FAST,
};

/* ------------------------------------------------------------------ */
/*  Model capabilities and costs                                       */
/* ------------------------------------------------------------------ */

export interface ModelInfo {
  level: ModelCapabilityLevel;
  inputCostPer1K: number;   // $ per 1,000 input tokens
  outputCostPer1K: number;  // $ per 1,000 output tokens
}

export const MODEL_CAPABILITIES: Record<string, ModelInfo> = {
  'gpt-4o': {
    level: ModelCapabilityLevel.PREMIUM,
    inputCostPer1K: 0.005,
    outputCostPer1K: 0.015,
  },
  'gpt-4o-mini': {
    level: ModelCapabilityLevel.STANDARD,
    inputCostPer1K: 0.00015,
    outputCostPer1K: 0.0006,
  },
  'claude-sonnet-4-5': {
    level: ModelCapabilityLevel.PREMIUM,
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
  },
  'claude-sonnet-4-5-20251022': {
    level: ModelCapabilityLevel.PREMIUM,
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
  },
  'claude-haiku': {
    level: ModelCapabilityLevel.FAST,
    inputCostPer1K: 0.00025,
    outputCostPer1K: 0.00125,
  },
  'gemini-1.5-pro': {
    level: ModelCapabilityLevel.PREMIUM,
    inputCostPer1K: 0.00125,
    outputCostPer1K: 0.005,
  },
  'gemini-flash': {
    level: ModelCapabilityLevel.STANDARD,
    inputCostPer1K: 0.000075,
    outputCostPer1K: 0.0003,
  },
  'llama-3.3-70b-versatile': {
    level: ModelCapabilityLevel.FAST,
    inputCostPer1K: 0.00059,
    outputCostPer1K: 0.00079,
  },
  'deepseek-chat': {
    level: ModelCapabilityLevel.FAST,
    inputCostPer1K: 0.00027,
    outputCostPer1K: 0.0011,
  },
  'ollama-local': {
    level: ModelCapabilityLevel.LOCAL,
    inputCostPer1K: 0,
    outputCostPer1K: 0,
  },
  'pollinations': {
    level: ModelCapabilityLevel.FAST,
    inputCostPer1K: 0,
    outputCostPer1K: 0,
  },
};

/* ------------------------------------------------------------------ */
/*  Provider → model ID mapping                                        */
/* ------------------------------------------------------------------ */

/**
 * Maps a provider name and config to a known model ID for cost lookups.
 */
export function resolveModelId(provider: string, config?: Record<string, unknown>): string {
  // 1. Always honor a user-selected model name if present — this is the actual
  //    model that will be used for the API call.
  const configured = config && (config.modelName as string | undefined);
  if (configured && String(configured).trim().length > 0) {
    return String(configured).trim();
  }

  // 2. Direct known models (provider itself is a model identifier)
  if (MODEL_CAPABILITIES[provider]) return provider;

  // 3. Map provider names to default model IDs
  const providerModelMap: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-5-20251022',
    google: 'gemini-1.5-pro',
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat',
    'deepseek-chat': 'deepseek-chat',
    mistral: 'mistral-large-latest',
    ollama: 'ollama-local',
    pollinations: 'pollinations',
    custom: 'gpt-4o-mini',
  };

  return providerModelMap[provider] || 'gpt-4o-mini'; // safest fallback
}

/* ------------------------------------------------------------------ */
/*  ModelAssignment type                                               */
/* ------------------------------------------------------------------ */

export type ModelAssignment = Partial<Record<TaskType, string>>;

/* ------------------------------------------------------------------ */
/*  Get saved model assignments from DB                                */
/* ------------------------------------------------------------------ */

async function getSavedModelAssignments(): Promise<ModelAssignment | null> {
  try {
    const row = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'modelAssignments'))
      .get();
    if (!row) return null;
    return JSON.parse(row.value) as ModelAssignment;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  getModelForTask — main routing function                             */
/* ------------------------------------------------------------------ */

export interface ModelRouteResult {
  connectorId: string;
  provider: string;
  modelId: string;
  estimatedCostPer1000Tokens: number;
}

/**
 * Route an LLM task to the best available model.
 *
 * Priority:
 * 1. Manual assignment in appSettings (user-configured)
 * 2. Auto-assign based on capability requirements vs available connectors
 *
 * Never throws — falls back to getActiveLLMProvider or best available.
 */
export async function getModelForTask(
  taskType: TaskType,
  brandProfileId?: string,
): Promise<ModelRouteResult> {
  try {
    // Step 1: Check for saved model assignment
    const assignments = await getSavedModelAssignments();
    if (assignments && assignments[taskType]) {
      const assignedConnectorId = assignments[taskType]!;
      const allConnectors = await db.select().from(connectors).all();
      const assignedConnector = allConnectors.find(
        (c) => c.id === assignedConnectorId && c.type === 'llm' && c.status === 'active',
      );
      if (assignedConnector) {
        const config = parseConfig(assignedConnector.configJson);
        const modelId = resolveModelId(assignedConnector.provider, config);
        const modelInfo = MODEL_CAPABILITIES[modelId];
        const avgCost = modelInfo
          ? (modelInfo.inputCostPer1K + modelInfo.outputCostPer1K) / 2
          : 0.001;
        return {
          connectorId: assignedConnector.id,
          provider: assignedConnector.provider,
          modelId,
          estimatedCostPer1000Tokens: avgCost,
        };
      }
    }

    // Step 2: Auto-assign — find best connector for this task's capability requirement
    const requiredLevel = TASK_CAPABILITY_REQUIREMENTS[taskType];
    const allConnectors = await db.select().from(connectors).all();
    const activeLLMs = allConnectors.filter((c) => c.type === 'llm' && c.status === 'active');

    if (activeLLMs.length === 0) {
      // Fallback to getActiveLLMProvider (will throw if no providers configured)
      const { provider, modelId } = await getActiveLLMProvider();
      const modelInfo = MODEL_CAPABILITIES[modelId];
      return {
        connectorId: 'fallback',
        provider: 'unknown',
        modelId,
        estimatedCostPer1000Tokens: modelInfo
          ? (modelInfo.inputCostPer1K + modelInfo.outputCostPer1K) / 2
          : 0.001,
      };
    }

    // Score each connector by how well it matches the required level
    const scored = activeLLMs.map((c) => {
      const config = parseConfig(c.configJson);
      const modelId = resolveModelId(c.provider, config);
      const modelInfo = MODEL_CAPABILITIES[modelId];
      const level = modelInfo?.level || ModelCapabilityLevel.STANDARD;

      // Score: higher = better match
      const levelOrder = [
        ModelCapabilityLevel.LOCAL,
        ModelCapabilityLevel.FAST,
        ModelCapabilityLevel.STANDARD,
        ModelCapabilityLevel.PREMIUM,
      ];
      const requiredIdx = levelOrder.indexOf(requiredLevel);
      const actualIdx = levelOrder.indexOf(level);

      // Prefer exact match or one level above
      let score = 0;
      if (actualIdx >= requiredIdx) {
        // Meets requirement: prefer exact match (score 100), then higher (score 80)
        score = actualIdx === requiredIdx ? 100 : 80;
      } else {
        // Below requirement: still usable but lower score
        score = Math.max(10, 50 - (requiredIdx - actualIdx) * 20);
      }

      const avgCost = modelInfo
        ? (modelInfo.inputCostPer1K + modelInfo.outputCostPer1K) / 2
        : 0.001;

      return { connector: c, modelId, score, avgCost, level };
    });

    // Sort: best score first, then lowest cost
    scored.sort((a, b) => b.score - a.score || a.avgCost - b.avgCost);

    const best = scored[0];
    return {
      connectorId: best.connector.id,
      provider: best.connector.provider,
      modelId: best.modelId,
      estimatedCostPer1000Tokens: best.avgCost,
    };
  } catch (err) {
    // Ultimate fallback
    console.warn('[ModelRouter] Fallback to default provider:', (err as Error).message);
    try {
      const { provider, modelId } = await getActiveLLMProvider();
      return {
        connectorId: 'fallback',
        provider: 'unknown',
        modelId,
        estimatedCostPer1000Tokens: 0.001,
      };
    } catch (fallbackErr) {
      throw new Error(
        'No active LLM provider configured. Please go to Connector Hub and add an API key.',
      );
    }
  }
}

function parseConfig(configJson: string): Record<string, unknown> {
  try {
    return JSON.parse(configJson);
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  Cost Estimation                                                    */
/* ------------------------------------------------------------------ */

export interface CostEstimate {
  estimatedCostUSD: number;
  breakdown: string;
}

/**
 * Estimate the cost of an LLM call.
 */
export function estimateCost(params: {
  taskType: TaskType;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  provider: string;
  modelId: string;
}): CostEstimate {
  const modelInfo = MODEL_CAPABILITIES[params.modelId] || MODEL_CAPABILITIES['gpt-4o-mini']!;
  const inputCost = (params.estimatedInputTokens / 1000) * modelInfo.inputCostPer1K;
  const outputCost = (params.estimatedOutputTokens / 1000) * modelInfo.outputCostPer1K;
  const total = inputCost + outputCost;

  const breakdown = `$${total.toFixed(4)} (${params.estimatedInputTokens.toLocaleString()} input tokens at $${modelInfo.inputCostPer1K}/1K + ${params.estimatedOutputTokens.toLocaleString()} output tokens at $${modelInfo.outputCostPer1K}/1K)`;

  return { estimatedCostUSD: total, breakdown };
}

/**
 * Estimate cost of a task at all three capability levels for comparison.
 */
export function estimateTaskCost(taskType: TaskType): {
  cheapest: CostEstimate;
  standard: CostEstimate;
  premium: CostEstimate;
} {
  const inputTokens = 1000; // Estimated default
  const outputTokens = 500;

  const cheapest = estimateCost({
    taskType,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
  });

  const standard = estimateCost({
    taskType,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    provider: 'openai',
    modelId: 'gpt-4o-mini',
  });

  const premium = estimateCost({
    taskType,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    provider: 'openai',
    modelId: 'gpt-4o',
  });

  return { cheapest, standard, premium };
}

/* ------------------------------------------------------------------ */
/*  Usage Tracking                                                     */
/* ------------------------------------------------------------------ */

export interface LLMUsageRecord {
  id?: string;
  taskType: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  brandProfileId?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt?: string;
}

/**
 * Record an LLM usage entry for cost tracking.
 * For providers that return usage (OpenAI, Anthropic), pass actual values.
 * For others, estimate based on text length (~4 chars per token).
 */
export async function recordLLMUsage(usage: LLMUsageRecord): Promise<void> {
  try {
    const { db } = await import('../db');
    const { llmUsage } = await import('../db/schema');
    const crypto = await import('crypto');

    await db.insert(llmUsage).values({
      id: crypto.default?.randomUUID?.() || crypto.randomUUID(),
      taskType: usage.taskType,
      provider: usage.provider,
      modelId: usage.modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUSD: usage.costUSD,
      brandProfileId: usage.brandProfileId || null,
      relatedEntityId: usage.relatedEntityId || null,
      relatedEntityType: usage.relatedEntityType || null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[ModelRouter] Failed to record LLM usage:', (err as Error).message);
  }
}

/**
 * Estimate token count from text length (~4 chars = 1 token).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost for a given model and token counts.
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const modelInfo = MODEL_CAPABILITIES[modelId];
  if (!modelInfo) return 0;
  return (
    (inputTokens / 1000) * modelInfo.inputCostPer1K +
    (outputTokens / 1000) * modelInfo.outputCostPer1K
  );
}

/**
 * Get a cost-saving tip based on current model assignments.
 */
export async function getCostSavingTip(brandProfileId?: string): Promise<string | null> {
  try {
    const assignments = await getSavedModelAssignments();
    if (!assignments) return null;

    // Find the most expensive task that could use a cheaper model
    const levelScores: Record<ModelCapabilityLevel, number> = {
      [ModelCapabilityLevel.PREMIUM]: 4,
      [ModelCapabilityLevel.STANDARD]: 3,
      [ModelCapabilityLevel.FAST]: 2,
      [ModelCapabilityLevel.LOCAL]: 1,
    };

    for (const [taskStr, connectorId] of Object.entries(assignments)) {
      const task = taskStr as TaskType;
      const requiredLevel = TASK_CAPABILITY_REQUIREMENTS[task];

      // Get the assigned connector's model level
      const allConnectors = await db.select().from(connectors).all();
      const conn = allConnectors.find((c) => c.id === connectorId);
      if (!conn) continue;

      const config = parseConfig(conn.configJson);
      const modelId = resolveModelId(conn.provider, config);
      const modelInfo = MODEL_CAPABILITIES[modelId];
      if (!modelInfo) continue;

      const currentLevel = levelScores[modelInfo.level] || 0;
      const minRequired = levelScores[requiredLevel] || 0;

      // If using a much higher tier than needed, suggest a cheaper option
      if (currentLevel > minRequired + 1) {
        const taskLabel = TASK_TYPE_LABELS[task] || task;
        const savings = (modelInfo.inputCostPer1K + modelInfo.outputCostPer1K) / 2;

        // Find a cheaper model that still meets requirements
        const cheaperModels = Object.entries(MODEL_CAPABILITIES)
          .filter(([, info]) => levelScores[info.level] === minRequired)
          .sort(([, a], [, b]) => a.inputCostPer1K - b.inputCostPer1K);

        if (cheaperModels.length > 0) {
          const cheaperModel = cheaperModels[0][0];
          const cheaperInfo = cheaperModels[0][1];
          const costDiff =
            ((modelInfo.inputCostPer1K + modelInfo.outputCostPer1K) -
              (cheaperInfo.inputCostPer1K + cheaperInfo.outputCostPer1K)) /
            2 *
            1000; // ~1000 tokens per task
          const monthlyEstimate = costDiff * 50; // ~50 tasks/month
          return `You are using ${modelId} for ${taskLabel}. Switching to ${cheaperModel} for this task would save approximately $${monthlyEstimate.toFixed(2)} this month with no quality reduction.`;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
