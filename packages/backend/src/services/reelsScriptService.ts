import { generateText } from 'ai';
import { callWithProviderChain } from '../lib/llmProvider';
import { buildBrandContext } from '../services/brandBrainService';
import { sanitizeUserInput } from '../lib/promptSanitizer';

export interface ReelsScene {
  duration: number;
  visualDescription: string;
  spokenText: string;
  textOverlay?: string;
}

export interface ReelsScript {
  hook: string;
  hookDuration: number;
  scenes: ReelsScene[];
  cta: string;
  ctaDuration: number;
  caption: string;
  hashtags: string[];
  audioSuggestion: string;
  estimatedDuration: number;
}

export type ReelsStyle = 'talking_head' | 'slideshow' | 'tutorial' | 'trending_audio';
export type ReelsDuration = 15 | 30 | 60 | 90;

export async function generateReelsScript(params: {
  brandProfileId: string;
  topic: string;
  targetDuration: ReelsDuration;
  reelsStyle: ReelsStyle;
}): Promise<ReelsScript> {
  const { brandProfileId, topic, targetDuration, reelsStyle } = params;

  const sanitizedTopic = sanitizeUserInput(topic);
  const brandContext = await buildBrandContext(brandProfileId, sanitizedTopic);

  const styleLabels: Record<ReelsStyle, string> = {
    talking_head: 'Talking Head (person on camera, speaking directly)',
    slideshow: 'Slideshow (series of images/cards with transitions)',
    tutorial: 'Tutorial (step-by-step how-to)',
    trending_audio: 'Trending Audio (synced to popular sounds)',
  };

  const prompt = `${brandContext}

Create a ${targetDuration}-second Instagram Reel script about: ${sanitizedTopic}
Style: ${styleLabels[reelsStyle]}

REELS PERFORMANCE RULES (follow these strictly):
- Hook: The first 1-3 seconds must stop the scroll. Use a visual hook or spoken hook.
  For talking head: start mid-sentence or with a bold statement, never "Hey guys".
  For tutorial: show the end result first, then reveal how.
  For slideshow: first slide must be a shocking stat or bold claim.
- Pacing: Cut every 2-3 seconds maximum. Short scenes perform better.
- Text overlays: Use them on every scene. Viewers often watch without sound.
- CTA: End with ONE specific action. Not "like and subscribe" — one thing.
  Best CTAs: "Save this for later", "Share with someone who needs this",
  "Comment {word} and I'll send you {resource}".

Return ONLY valid JSON with these exact fields:
{
  "hook": "string (the exact first words or visual description for the first 3 seconds)",
  "hookDuration": "number (seconds, 2-3)",
  "scenes": [ { "duration": "number", "visualDescription": "string", "spokenText": "string", "textOverlay": "string" } ],
  "cta": "string (the exact CTA text)",
  "ctaDuration": "number (seconds, 3-5)",
  "caption": "string (Instagram caption for the Reel post)",
  "hashtags": ["string"] (15 hashtags, no # symbol),
  "audioSuggestion": "string (description of ideal background music or trending audio type)",
  "estimatedDuration": "number (total seconds)"
}`;

  const text = await callWithProviderChain(
    'content generation',
    async (provider, modelId) => {
      const { text: t } = await generateText({
        model: provider.chat(modelId),
        prompt,
      });
      return t;
    },
    () => JSON.stringify({
      hook: 'Here is something you need to know...',
      hookDuration: 3,
      scenes: [
        { duration: 8, visualDescription: 'You on camera speaking directly to the viewer', spokenText: `Let me share something important about ${sanitizedTopic}. This is going to change how you think about it.`, textOverlay: 'Listen up!' },
        { duration: 8, visualDescription: 'Cut to a close-up or relevant b-roll', spokenText: `Here is the key insight about ${sanitizedTopic} that most people miss. Pay attention because this is where the value is.`, textOverlay: 'The Key Insight' },
        { duration: 8, visualDescription: 'Back to camera or text overlay with the main point', spokenText: 'So here is what I want you to do. Apply this today and you will see real results.', textOverlay: 'Try This Today' },
      ],
      cta: 'Save this for later and share with someone who needs to hear it',
      ctaDuration: 3,
      caption: `Here is my take on ${sanitizedTopic}. What do you think? Drop your thoughts below! 👇`,
      hashtags: ['vimo', 'marketingtips', 'contentcreation', 'socialmedia', 'growth', 'branding', 'digitalmarketing', 'businessgrowth', 'instagramtips', 'marketingstrategy', 'contentmarketing', 'smallbiztips', 'entrepreneur', 'creatoreconomy', 'socialmediatips'],
      audioSuggestion: 'Upbeat, trending instrumental background music',
      estimatedDuration: 30,
    })
  );

  let parsed: ReelsScript;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new Error('Failed to parse Reels script. Please try again.');
  }

  // Validate and normalize
  if (!parsed.hook || !Array.isArray(parsed.scenes)) {
    throw new Error('Invalid script format returned by LLM.');
  }

  // Ensure hashtags have no # prefix
  parsed.hashtags = (parsed.hashtags || [])
    .slice(0, 15)
    .map((h: string) => h.replace(/^#/, ''));

  // Ensure estimated duration is reasonable
  const sceneDuration = parsed.scenes.reduce((sum: number, s: ReelsScene) => sum + (s.duration || 2), 0);
  parsed.estimatedDuration = (parsed.hookDuration || 2) + sceneDuration + (parsed.ctaDuration || 3);

  return parsed;
}
