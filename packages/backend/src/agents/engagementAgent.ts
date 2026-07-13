/**
 * Engagement Agent — Smart Intent Detection & Reply Generation
 *
 * Classifies incoming comments by intent (purchase, complaint, question, etc.)
 * and generates on-brand replies. Uses fast keyword matching first, then
 * falls back to LLM classification when ambiguous.
 */

import { generateText } from 'ai';
import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';
import { TaskType, getModelForTask, recordLLMUsage, estimateTokenCount, calculateCost, resolveModelId } from '../lib/modelRouter';
import { buildBrandContext } from '../services/brandBrainService';
import { sanitizeUserInput } from '../lib/promptSanitizer';

/* ------------------------------------------------------------------ */
/*  Intent definitions                                                 */
/* ------------------------------------------------------------------ */

export interface IntentMatch {
  intent: string;
  confidence: number;
  alertUser: boolean;
}

const COMMENT_INTENTS: Record<string, string[]> = {
  purchase_intent: [
    'how much', 'price', 'where to buy', 'is this available',
    'how do i get', 'link', 'dm me', 'can i order', 'buy this',
    'shop', 'purchase', 'cost', 'shipping', 'delivery', 'order',
    'discount', 'coupon', 'sale', 'deal',
  ],
  complaint: [
    "doesn't work", 'bad', 'disappointed', 'worst', 'never again',
    'waste of money', 'scam', 'terrible', 'horrible', 'awful',
    'refund', 'broken', 'defective', 'unacceptable', 'angry',
    'furious', 'hate', 'rip off', 'ripoff',
  ],
  question: [
    'how', 'what', 'when', 'why', 'can you', '?', 'help',
    'tell me', 'explain', 'wondering', 'curious', 'could you',
    'would you', 'is it', 'does it', 'do you',
  ],
  compliment: [
    'love', 'amazing', 'perfect', 'best', 'obsessed',
    'beautiful', 'stunning', 'incredible', 'awesome', 'fantastic',
    'great job', 'well done', 'brilliant', 'excellent', 'outstanding',
    'fire', 'goat', 'slay',
  ],
  spam: [
    'follow me', 'check my page', 'dm me for', 'link in bio',
    'earn money', 'giveaway', 'free followers', 'make money fast',
    'click here', 'congratulations you won', 'claim now',
    'follow for follow', 'f4f', 'l4l',
  ],
};

/* ------------------------------------------------------------------ */
/*  detectIntent                                                       */
/* ------------------------------------------------------------------ */

export async function detectIntent(
  commentText: string
): Promise<{ intent: string; confidence: number; alertUser: boolean }> {
  const lowerText = commentText.toLowerCase();

  // Fast keyword check — look for the strongest match
  let bestIntent: string | null = null;
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(COMMENT_INTENTS)) {
    let matchCount = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      // Score: proportion of keywords matched (clamped), boosted by count
      const score = Math.min(matchCount / Math.ceil(keywords.length * 0.15), 1);
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }
  }

  if (bestIntent && bestScore >= 0.3) {
    const confidence = Math.round(bestScore * 100);
    return {
      intent: bestIntent,
      confidence,
      alertUser: bestIntent === 'purchase_intent' || bestIntent === 'complaint',
    };
  }

  // Fallback: call LLM for classification
  try {
    const sanitizedText = sanitizeUserInput(commentText);

    const prompt = `Classify this Instagram comment into exactly ONE intent category.

Comment: "${sanitizedText}"

Possible intents:
- purchase_intent: interested in buying, asking about price/availability
- complaint: negative feedback, dissatisfaction
- question: asking for information or help
- compliment: positive feedback, praise
- spam: promotional, scam, or bot-like content
- general: none of the above

Return ONLY valid JSON: { "intent": "category_name", "confidence": 0-100 }`;

    const modelRoute = await getModelForTask(TaskType.INTENT_CLASSIFICATION);

    return await callWithProviderChain(
      'engagement intent detection',
      async (provider, modelId) => {
        const { text } = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        // Record usage
        const inputTokens = estimateTokenCount(prompt);
        const outputTokens = estimateTokenCount(text);
        recordLLMUsage({
          taskType: TaskType.INTENT_CLASSIFICATION,
          provider: modelRoute.provider,
          modelId: modelRoute.modelId,
          inputTokens,
          outputTokens,
          costUSD: calculateCost(modelRoute.modelId, inputTokens, outputTokens),
        });
        const parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
        const intent = parsed.intent || 'general';
        const confidence = Number(parsed.confidence) || 50;
        return { intent, confidence, alertUser: intent === 'purchase_intent' || intent === 'complaint' };
      },
      () => ({ intent: 'general', confidence: 30, alertUser: false }),
      modelRoute
    );
  } catch {
    return { intent: 'general', confidence: 30, alertUser: false };
  }
}

/* ------------------------------------------------------------------ */
/*  classifySentiment (enhanced with intent)                           */
/* ------------------------------------------------------------------ */

export interface SentimentResult {
  sentiment: string;
  confidence: number;
  intent: string;
  intentConfidence: number;
  alertUser: boolean;
}

export async function classifySentiment(
  commentText: string
): Promise<SentimentResult> {
  const intentResult = await detectIntent(commentText);

  let sentiment = 'neutral';
  let sentimentConfidence = 50;

  switch (intentResult.intent) {
    case 'complaint':
      sentiment = 'negative';
      sentimentConfidence = Math.max(intentResult.confidence, 70);
      break;
    case 'compliment':
      sentiment = 'positive';
      sentimentConfidence = Math.max(intentResult.confidence, 70);
      break;
    case 'spam':
      sentiment = 'spam';
      sentimentConfidence = Math.max(intentResult.confidence, 80);
      break;
    case 'purchase_intent':
      sentiment = 'positive';
      sentimentConfidence = Math.max(intentResult.confidence, 60);
      break;
    case 'question':
      sentiment = 'neutral';
      sentimentConfidence = Math.max(intentResult.confidence, 60);
      break;
    default:
      // Try LLM for neutral/general sentiment
      try {
        const sanitizedText = sanitizeUserInput(commentText);

        const prompt = `Rate the sentiment of this comment as positive, negative, or neutral.
Comment: "${sanitizedText}"
Return ONLY valid JSON: { "sentiment": "positive|negative|neutral", "confidence": 0-100 }`;

        const text = await callWithProviderChain(
          'engagement sentiment',
          async (provider, modelId) => {
            const { text: t } = await generateText({
              model: provider.chat(modelId),
              prompt,
            });
            const inputTokens = estimateTokenCount(prompt);
            const outputTokens = estimateTokenCount(t);
            recordLLMUsage({
              taskType: TaskType.ENGAGEMENT_REPLY,
              provider: provider.constructor?.name || 'unknown',
              modelId: modelId || 'unknown',
              inputTokens,
              outputTokens,
              costUSD: calculateCost(resolveModelId(modelId || 'unknown'), inputTokens, outputTokens),
            });
            return t;
          },
          () => JSON.stringify({ sentiment: 'neutral', confidence: 50 })
        );

        const parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
        sentiment = parsed.sentiment || 'neutral';
        sentimentConfidence = Number(parsed.confidence) || 50;
      } catch {
        sentiment = 'neutral';
        sentimentConfidence = 50;
      }
  }

  return {
    sentiment,
    confidence: sentimentConfidence,
    intent: intentResult.intent,
    intentConfidence: intentResult.confidence,
    alertUser: intentResult.alertUser,
  };
}

/* ------------------------------------------------------------------ */
/*  generateReply (enhanced with intent awareness)                     */
/* ------------------------------------------------------------------ */

export interface ReplyResult {
  reply: string;
  confidence: number;
  intent: string;
  sentiment: string;
  alertUser: boolean;
}

export async function generateReply(
  commentText: string,
  authorHandle: string,
  brandProfileId: string
): Promise<ReplyResult> {
  // First classify sentiment + detect intent
  const classification = await classifySentiment(commentText);

  // For spam, don't generate a reply
  if (classification.intent === 'spam') {
    return {
      reply: '',
      confidence: 0,
      intent: 'spam',
      sentiment: 'spam',
      alertUser: false,
    };
  }

  const modelRoute = await getModelForTask(TaskType.ENGAGEMENT_REPLY);

  const brandContext = await buildBrandContext(brandProfileId, 'engagement reply');

  const sanitizedText = sanitizeUserInput(commentText);
  const sanitizedHandle = sanitizeUserInput(authorHandle);

  let intentInstructions = '';
  if (classification.intent === 'purchase_intent') {
    intentInstructions = `
This is a PURCHASE INTENT comment. The user is interested in buying.
Generate a friendly reply that invites them to DM for pricing/details.
Example: "Thanks for your interest! We'd love to help — send us a DM with your requirements and we'll get back to you with pricing and availability."`;
  } else if (classification.intent === 'complaint') {
    intentInstructions = `
This is a COMPLAINT. The user is unhappy. Be empathetic, apologetic, and offer to help resolve the issue.
Do NOT be defensive. Acknowledge their frustration and offer a path to resolution.`;
  } else if (classification.intent === 'question') {
    intentInstructions = `
This is a QUESTION. Provide a helpful, clear answer. If you don't know the specific answer, direct them to DM or customer support.`;
  } else if (classification.intent === 'compliment') {
    intentInstructions = `
This is a COMPLIMENT. Be warm, grateful, and encourage continued engagement. Don't be overly salesy.`;
  }

  const prompt = `You are an engagement manager for a brand.
Brand Context: ${brandContext}
User "${sanitizedHandle}" on Instagram said:
"${sanitizedText}"

Sentiment: ${classification.sentiment} (${classification.confidence}% confidence)
Intent: ${classification.intent} (${classification.intentConfidence}% confidence)
${intentInstructions}

Generate a helpful, on-brand reply. Keep it concise (under 150 characters ideally).
Return ONLY valid JSON:
{
  "reply": "the reply text",
  "confidence": 85
}`;

  const defaultResult = {
    reply: '',
    confidence: 0,
    intent: classification.intent,
    sentiment: classification.sentiment,
    alertUser: classification.alertUser,
  };

  try {
    const replyModelRoute = await getModelForTask(TaskType.ENGAGEMENT_REPLY);

    const text = await callWithProviderChain(
      'engagement reply generation',
      async (provider, modelId) => {
        const { text: t } = await generateText({
          model: provider.chat(modelId),
          prompt,
        });
        // Record usage
        const inputTokens = estimateTokenCount(prompt);
        const outputTokens = estimateTokenCount(t);
        recordLLMUsage({
          taskType: TaskType.ENGAGEMENT_REPLY,
          provider: replyModelRoute.provider,
          modelId: replyModelRoute.modelId,
          inputTokens,
          outputTokens,
          costUSD: calculateCost(replyModelRoute.modelId, inputTokens, outputTokens),
          brandProfileId,
          relatedEntityType: 'engagement_reply',
        });
        return t;
      },
      () => '',
      replyModelRoute
    );

    if (!text) return defaultResult;

    const result = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
    return {
      reply: result.reply || 'Thanks for reaching out!',
      confidence: result.confidence || 50,
      intent: classification.intent,
      sentiment: classification.sentiment,
      alertUser: classification.alertUser,
    };
  } catch {
    return defaultResult;
  }
}
