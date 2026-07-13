import crypto from 'crypto';
import { generateText, ToolCallPart, ToolResultPart } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { assistantMessages, brandProfiles } from '../db/schema';
import { callWithProviderChain } from '../lib/llmProvider';
import { assistantTools, VIMO_KNOWLEDGE, getToolDescriptions, ToolName } from './vimoTools';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  intentType: string | null;
  systemActionTaken: string | null;
  systemActionResult: string | null;
  sessionId: string;
  createdAt: string;
}

export interface AssistantResponse {
  message: string;
  intent: { type: string; details: string };
  action: string;
  result: unknown;
  navigationTarget?: string;
  quickReplies: string[];
}

function generateQuickReplies(lastToolName?: string, success?: boolean): string[] {
  if (!lastToolName) {
    return ['Start autopilot', 'Write a post', 'Run brand audit', 'Search trends'];
  }
  const map: Record<string, string[]> = {
    create_campaign: ['Show my campaigns', 'Start autopilot', 'Write a post'],
    list_campaigns: ['Create campaign', 'Start autopilot', 'Show analytics'],
    update_campaign: ['Show campaigns', 'Start autopilot', 'Create a post'],
    write_post: ['Schedule this', 'Generate another', 'Show analytics'],
    generate_hashtags: ['Write a post with these', 'More hashtags', 'Create content'],
    rewrite_content: ['Schedule this', 'Rewrite another', 'Show analytics'],
    get_analytics: ['Why did engagement drop?', 'What should I post?', 'Start autopilot'],
    get_top_content: ['Create similar content', 'Analyze performance', 'Schedule a post'],
    create_video: ['Check video status', 'Create another', 'Show analytics'],
    list_videos: ['Create new video', 'Show analytics', 'Start autopilot'],
    start_autopilot: ['What happens next?', 'Show analytics', 'Create a campaign'],
    stop_autopilot: ['Start autopilot', 'Show dashboard', 'Create content'],
    get_autopilot_status: ['Start autopilot', 'Show dashboard', 'Create campaign'],
    search_web: ['Summarize this', 'Search more', 'Create content from this'],
    fetch_url: ['Summarize this', 'Search more', 'Create content'],
    get_brand_profile: ['Update brand', 'Run brand audit', 'Show analytics'],
    update_brand_profile: ['Run brand audit', 'Show dashboard', 'Create content'],
    run_brand_audit: ['What should I fix?', 'Start autopilot', 'Show trends'],
    list_connectors: ['Add connector', 'Test connection', 'Show analytics'],
    test_connector: ['List connectors', 'Show dashboard', 'Start autopilot'],
    schedule_post: ['Show schedule', 'Create another post', 'Analyze calendar'],
    list_scheduled_posts: ['Create new post', 'Show analytics', 'Start autopilot'],
    cancel_scheduled_post: ['Show schedule', 'Create new post', 'Start autopilot'],
    get_settings: ['Update setting', 'Show dashboard', 'Start autopilot'],
    update_setting: ['Show settings', 'Show dashboard', 'List connectors'],
    navigate: ['What would you like to do?', 'Start autopilot', 'Create content'],
    add_competitor: ['Show competitors', 'Track trends', 'Start autopilot'],
    list_competitors: ['Add competitor', 'Track trends', 'Run brand audit'],
    list_trends: ['Create content about this', 'Analyze performance', 'Add competitor'],
    list_opportunities: ['Act on opportunity', 'Start autopilot', 'Show dashboard'],
  };
  return map[lastToolName] || ['Start autopilot', 'Roast my brand', 'Show trends', 'Create a campaign'];
}

function extractToolInfo(steps: Array<{ toolCalls: ToolCallPart[]; toolResults: ToolResultPart[] }>) {
  const names: string[] = [];
  const navTargets: string[] = [];
  const results: unknown[] = [];
  const allSucceeded: boolean[] = [];

  for (const step of steps) {
    for (let i = 0; i < step.toolCalls.length; i++) {
      const tc = step.toolCalls[i];
      names.push(tc.toolName);
      if (step.toolResults[i]) {
        try {
          const parsed = JSON.parse(step.toolResults[i].result as string);
          allSucceeded.push(parsed.success !== false);
          if (parsed.navigationTarget) navTargets.push(parsed.navigationTarget);
          results.push(parsed);
        } catch {
          allSucceeded.push(true);
          results.push(step.toolResults[i].result);
        }
      }
    }
  }

  return {
    toolNames: names,
    navigationTarget: navTargets.length > 0 ? navTargets[navTargets.length - 1] : undefined,
    results,
    allSuccess: allSucceeded.length === 0 || allSucceeded.every(Boolean),
    lastToolName: names.length > 0 ? names[names.length - 1] : undefined,
  };
}

export async function processMessage(params: {
  userMessage: string;
  brandProfileId: string;
  sessionId: string;
}): Promise<AssistantResponse> {
  const { userMessage, brandProfileId, sessionId } = params;

  const allMessages = db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.sessionId, sessionId))
    .orderBy(desc(assistantMessages.createdAt))
    .all()
    .reverse()
    .slice(-6) as AssistantMessage[];

  const brand = db.select().from(brandProfiles).where(eq(brandProfiles.id, brandProfileId)).get();
  const brandContext = brand
    ? `Brand: ${brand.name}, Industry: ${brand.industry}, Audience: ${brand.audience}`
    : 'No brand profile found.';

  const now = new Date().toISOString();
  await db.insert(assistantMessages).values({
    id: crypto.randomUUID(), role: 'user', content: userMessage,
    intentType: null, systemActionTaken: null, systemActionResult: null,
    sessionId, createdAt: now,
  });

  const systemPrompt = `${VIMO_KNOWLEDGE}

Current brand context: ${brandContext}

AVAILABLE TOOLS:
${getToolDescriptions()}

RULES:
- Use tools to do things. If the user asks to do something, call the appropriate tool.
- For multiple-step requests (e.g., "research a topic and write a post"), use multiple tools in sequence.
- CRITICAL: Only say "done" or "completed" when a tool actually succeeded. If a tool returns {success: false}, tell the user exactly what failed and why. If you cannot do something, say so clearly and suggest alternatives.
- After a tool call succeeds, tell the user what happened and what they should do next.
- For web search results, summarize what you found.
- Be concise but confident. You're the expert.
- Remember the full conversation history — refer back to earlier messages when relevant.`;

  let finalText: string;
  let toolInfo: ReturnType<typeof extractToolInfo>;

  try {
    const result = await callWithProviderChain(
      'assistant_classification',
      async (provider, modelId) => {
        const res = await generateText({
          model: provider.chat(modelId),
          tools: assistantTools,
          system: systemPrompt,
          messages: [
            ...allMessages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
            { role: 'user' as const, content: userMessage },
          ],
          maxSteps: 8,
        });
        return res;
      }
    );

    finalText = result.text;
    toolInfo = extractToolInfo(result.steps || []);
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    console.error('[Assistant] Agent error:', errMsg);

    // Last resort: try built-in Pollinations.ai without tools
    let pollinationsResult: string | null = null;
    try {
      const fallbackProvider = createOpenAI({ apiKey: 'pollinations', baseURL: 'https://text.pollinations.ai/openai' });
      const res = await generateText({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: (fallbackProvider as any).chat('openai'),
        system: systemPrompt,
        messages: [
          ...allMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user' as const, content: userMessage },
        ],
      });
      pollinationsResult = res.text;
    } catch (fallbackErr) {
      console.error('[Assistant] Pollinations fallback also failed:', (fallbackErr as Error).message);
    }

    if (pollinationsResult) {
      finalText = pollinationsResult;
      toolInfo = { toolNames: [], navigationTarget: undefined, results: [], allSuccess: true, lastToolName: undefined };
    } else if (errMsg.includes('API key') || errMsg.includes('No active LLM provider')) {
      finalText = "I can't process that right now — there's no active AI provider configured. Go to **Settings > AI Models** and connect an API key (OpenAI, Anthropic, Groq, etc.), then I'll be ready to help.";
      toolInfo = { toolNames: [], navigationTarget: undefined, results: [], allSuccess: false, lastToolName: undefined };
    } else if (errMsg.includes('rate limit') || errMsg.includes('429')) {
      finalText = "Hit a rate limit on the AI provider. Give it a moment and try again.";
      toolInfo = { toolNames: [], navigationTarget: undefined, results: [], allSuccess: false, lastToolName: undefined };
    } else if (errMsg.includes('401') || errMsg.includes('auth') || errMsg.includes('unauthorized')) {
      finalText = "The AI provider's API key seems invalid or expired. Go to **Settings > AI Models** to check your key.";
      toolInfo = { toolNames: [], navigationTarget: undefined, results: [], allSuccess: false, lastToolName: undefined };
    } else if (errMsg.includes('exhausted retries')) {
      const providerMatch = errMsg.match(/Provider "(.+?)"/);
      const providerName = providerMatch ? providerMatch[1] : 'your AI provider';
      finalText = `I couldn't reach ${providerName} — their API may be down or rate-limiting us. You can try:\n\n1. **Wait a moment and try again**\n2. **Add a backup provider** in Settings > AI Models (e.g., add both Groq AND OpenAI)\n3. **Check your API key** in Connector Hub to make sure it's still valid`;
      toolInfo = { toolNames: [], navigationTarget: undefined, results: [], allSuccess: false, lastToolName: undefined };
    } else {
      finalText = `Ran into an issue processing that. Could you try again or rephrase?`;
      toolInfo = { toolNames: [], navigationTarget: undefined, results: [], allSuccess: false, lastToolName: undefined };
    }
  }

  const quickReplies = generateQuickReplies(toolInfo.lastToolName, toolInfo.allSuccess);
  const actionTaken = toolInfo.toolNames.length > 0 ? toolInfo.toolNames.join(', ') : 'direct_answer';

  const responseId = crypto.randomUUID();
  await db.insert(assistantMessages).values({
    id: responseId, role: 'assistant', content: finalText,
    intentType: toolInfo.lastToolName || 'general_question',
    systemActionTaken: actionTaken,
    systemActionResult: toolInfo.results.length > 0 ? JSON.stringify(toolInfo.results) : null,
    sessionId, createdAt: new Date().toISOString(),
  });

  return {
    message: finalText,
    intent: {
      type: toolInfo.lastToolName || 'general_question',
      details: actionTaken,
    },
    action: actionTaken,
    result: toolInfo.results,
    navigationTarget: toolInfo.navigationTarget,
    quickReplies,
  };
}
