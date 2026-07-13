import { generateText } from 'ai';
import { getActiveLLMProvider, callWithProviderChain } from '../lib/llmProvider';
import { buildBrandContext } from '../services/brandBrainService';
import { sanitizeUserInput } from '../lib/promptSanitizer';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brandProfiles } from '../db/schema';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GoalTemplate {
  label: string;
  questions: Array<{ field: string; label: string; placeholder: string }>;
  funnelWeeks: Record<number, string>;
}

export interface GoalTranslationResult {
  goalType: string;
  funnelPlan: Record<number, string>;
  refinedGoal: string;
  keyMessages: string[];
  successMetrics: string[];
}

/* ------------------------------------------------------------------ */
/*  Goal Templates                                                     */
/* ------------------------------------------------------------------ */

export const CAMPAIGN_GOAL_TEMPLATES: Record<string, GoalTemplate> = {
  product_launch: {
    label: 'Launch a product or service',
    questions: [
      { field: 'productName', label: 'What is the product name?', placeholder: 'e.g. CloudSync Pro' },
      { field: 'problemSolved', label: 'What problem does it solve?', placeholder: 'e.g. Keeps your files in sync across all devices' },
      { field: 'price', label: 'What is the price?', placeholder: 'e.g. $29/month or Free trial' },
      { field: 'launchDate', label: 'When does it launch?', placeholder: 'e.g. July 15, 2026' },
      { field: 'targetAudience', label: 'Who is it for?', placeholder: 'e.g. Small business owners who need reliable file syncing' },
    ],
    funnelWeeks: { 1: 'awareness', 2: 'education', 3: 'social_proof', 4: 'conversion' },
  },
  grow_followers: {
    label: 'Grow my Instagram following',
    questions: [
      { field: 'niche', label: 'What is your niche?', placeholder: 'e.g. Handmade silver jewellery for women 25-45' },
      { field: 'idealFollower', label: 'Who is your ideal follower?', placeholder: 'e.g. Women who appreciate artisan craftsmanship' },
      { field: 'valueProposition', label: 'What value will you give them?', placeholder: 'e.g. Styling tips, behind-the-scenes, exclusive drops' },
    ],
    funnelWeeks: { 1: 'educational', 2: 'entertaining', 3: 'engaging', 4: 'community' },
  },
  drive_website_traffic: {
    label: 'Get more people to my website',
    questions: [
      { field: 'targetPage', label: 'What is the main page you want people to visit?', placeholder: 'e.g. www.mysite.com/shop' },
      { field: 'pageContent', label: 'What will they find there?', placeholder: 'e.g. Our full collection of handmade jewellery' },
      { field: 'desiredAction', label: 'What do you want them to do?', placeholder: 'e.g. Browse and make a purchase' },
    ],
    funnelWeeks: { 1: 'awareness', 2: 'teaser', 3: 'value_preview', 4: 'direct_cta' },
  },
  build_brand_authority: {
    label: 'Build my reputation as an expert',
    questions: [
      { field: 'expertise', label: 'What are you an expert in?', placeholder: 'e.g. Sustainable fashion and ethical sourcing' },
      { field: 'knownBy', label: 'Who do you want to be known by?', placeholder: 'e.g. Conscious consumers and industry peers' },
    ],
    funnelWeeks: { 1: 'opinion', 2: 'educational', 3: 'case_study', 4: 'thought_leadership' },
  },
  promote_event: {
    label: 'Promote an event or launch',
    questions: [
      { field: 'eventName', label: 'What is the event?', placeholder: 'e.g. Summer Collection Launch Party' },
      { field: 'eventDate', label: 'When is it?', placeholder: 'e.g. July 20, 2026 at 6PM' },
      { field: 'registrationMethod', label: 'How do people register?', placeholder: 'e.g. Link in bio, RSVP form on website' },
      { field: 'attendeeValue', label: 'What will they get from attending?', placeholder: 'e.g. Early access, exclusive discounts, networking' },
    ],
    funnelWeeks: { 1: 'announce', 2: 'build_anticipation', 3: 'social_proof', 4: 'urgency' },
  },
  seasonal_sale: {
    label: 'Run a sale or promotion',
    questions: [
      { field: 'offerDescription', label: 'What is the offer?', placeholder: 'e.g. End of season clearance' },
      { field: 'discountDetails', label: 'What is the discount or deal?', placeholder: 'e.g. 30% off everything, BOGO on select items' },
      { field: 'endDate', label: 'When does it end?', placeholder: 'e.g. Sunday midnight' },
      { field: 'howToGetIt', label: 'How do people get it?', placeholder: 'e.g. Use code SUMMER30 at checkout' },
    ],
    funnelWeeks: { 1: 'tease', 2: 'launch', 3: 'urgency', 4: 'last_chance' },
  },
};

/* ------------------------------------------------------------------ */
/*  Phase Descriptions                                                 */
/* ------------------------------------------------------------------ */

export const PHASE_DESCRIPTIONS: Record<string, string> = {
  awareness: 'Introduce the topic, brand, or product without selling. Build familiarity.',
  education: 'Teach the audience something valuable related to the product or service.',
  social_proof: 'Show results, testimonials, case studies, or before/after.',
  conversion: 'Direct selling with clear CTA, price, and how to buy.',
  engaging: 'Ask questions, run polls, encourage comments and shares.',
  urgency: 'Emphasize limited time, scarcity, or deadline.',
  community: 'Foster belonging, user-generated content, and peer interaction.',
  entertaining: 'Create fun, shareable content that resonates emotionally.',
  educational: 'Teach the audience something valuable related to the product or service.',
  teaser: 'Hint at what\'s coming without revealing everything. Build curiosity.',
  value_preview: 'Show a taste of the value they\'ll find — a sneak peek or sample.',
  direct_cta: 'Clear call-to-action driving traffic to the website or page.',
  opinion: 'Share your unique perspective or hot take on industry topics.',
  case_study: 'Show real results, before/after, or success stories.',
  thought_leadership: 'Publish original insights, data, or frameworks.',
  announce: 'Make the official announcement with key details.',
  build_anticipation: 'Create excitement through sneak peeks, countdowns, and teasers.',
  last_chance: 'Final push — emphasize the clock is running out.',
  launch: 'Go live with the offer. Make it easy to buy.',
  tease: 'Build curiosity about what\'s coming without revealing details.',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function buildFunnelPlan(
  goalType: string,
  durationDays: number
): Record<number, string> {
  const template = CAMPAIGN_GOAL_TEMPLATES[goalType];
  if (!template) return { 1: 'awareness', 2: 'education', 3: 'social_proof', 4: 'conversion' };

  const durationWeeks = Math.max(1, Math.ceil(durationDays / 7));

  if (durationWeeks <= 2) {
    // Compress to 2 phases
    const phases = Object.values(template.funnelWeeks);
    return {
      1: phases[0] || 'awareness',
      2: phases[phases.length - 1] || 'conversion',
    };
  }

  if (durationWeeks <= 4) {
    // Use all 4 phases
    return { ...template.funnelWeeks };
  }

  // 6+ weeks: extend the middle phases
  const base = { ...template.funnelWeeks };
  const extended: Record<number, string> = {};
  const phases = Object.values(template.funnelWeeks);

  // Distribute weeks evenly across 4 phases
  const weeksPerPhase = Math.floor(durationWeeks / 4);
  const remainder = durationWeeks % 4;

  let currentWeek = 1;
  for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
    const phaseWeeks = weeksPerPhase + (phaseIdx < remainder ? 1 : 0);
    for (let w = 0; w < phaseWeeks; w++) {
      extended[currentWeek] = phases[phaseIdx];
      currentWeek++;
    }
  }

  return extended;
}

/* ------------------------------------------------------------------ */
/*  Main Translation Function                                          */
/* ------------------------------------------------------------------ */

export async function translateGoalToStrategy(params: {
  userGoal: string;
  brandProfileId: string;
  durationDays: number;
  goalAnswers?: Record<string, string>;
}): Promise<GoalTranslationResult> {
  const { userGoal, brandProfileId, durationDays, goalAnswers } = params;
  const sanitizedGoal = sanitizeUserInput(userGoal);

  // Fetch brand profile for context
  const row = await db.select().from(brandProfiles).where(eq(brandProfiles.id, brandProfileId)).get();
  const brandName = row?.name || 'Unknown Brand';
  const brandIndustry = row?.industry || 'General';
  const brandAudience = row?.audience || 'General audience';

  // Step 1: Classify the goal
  const classifyPrompt = `Classify this marketing goal into one of these categories: product_launch, grow_followers, drive_website_traffic, build_brand_authority, promote_event, seasonal_sale. Goal: ${sanitizedGoal}. Return only the category key.`;

  const classifyResultText = await callWithProviderChain(
    'campaign strategy',
    async (provider, modelId) => {
      const { text } = await generateText({
        model: provider.chat(modelId),
        prompt: classifyPrompt,
      });
      return text;
    },
    () => 'product_launch'
  );
  const classifyResult = { text: classifyResultText };

  const goalType = classifyResult.text.trim().toLowerCase().replace(/[^a-z_]/g, '_');
  // Validate the goal type
  const validGoalTypes = Object.keys(CAMPAIGN_GOAL_TEMPLATES);
  const matchedGoalType = validGoalTypes.includes(goalType)
    ? goalType
    : validGoalTypes.find((t) => goalType.includes(t)) || 'product_launch';

  // Step 2: Build funnel plan based on goalType and duration
  const funnelPlan = buildFunnelPlan(matchedGoalType, durationDays);

  // Step 3: Refine the goal with LLM
  const answersContext = goalAnswers
    ? Object.entries(goalAnswers)
        .map(([k, v]) => `${k}: ${sanitizeUserInput(v)}`)
        .join('\n')
    : '';

  const refinePrompt = `Given this marketing goal: ${sanitizedGoal}
Brand: ${brandName}, ${brandIndustry}, audience: ${brandAudience}
Goal type: ${matchedGoalType}
${answersContext ? `Additional details:\n${answersContext}` : ''}

Return ONLY valid JSON with these fields:
{
  "refinedGoal": "string - a more specific version of their goal incorporating the details they provided",
  "keyMessages": ["string", "string", "string"],
  "successMetrics": ["string", "string", "string"]
}`;

  const refineResultText = await callWithProviderChain(
    'campaign strategy',
    async (provider, modelId) => {
      const { text } = await generateText({
        model: provider.chat(modelId),
        prompt: refinePrompt,
      });
      return text;
    },
    () => JSON.stringify({ refinedGoal: sanitizedGoal, keyMessages: [sanitizedGoal], successMetrics: ['Engagement rate', 'Reach', 'Conversions'] })
  );
  const refineResult = { text: refineResultText };

  let refinedGoal: string;
  let keyMessages: string[];
  let successMetrics: string[];

  try {
    const parsed = JSON.parse(refineResult.text.trim());
    refinedGoal = parsed.refinedGoal || sanitizedGoal;
    keyMessages = Array.isArray(parsed.keyMessages)
      ? parsed.keyMessages.slice(0, 3)
      : [sanitizedGoal];
    successMetrics = Array.isArray(parsed.successMetrics)
      ? parsed.successMetrics.slice(0, 3)
      : ['Engagement rate', 'Reach', 'Conversions'];
  } catch {
    // Fallback if LLM doesn't return valid JSON
    refinedGoal = sanitizedGoal;
    keyMessages = [sanitizedGoal, `${brandName} value proposition`, `${brandName} call to action`];
    successMetrics = ['Increase engagement by 20%', 'Reach target audience', 'Drive meaningful conversions'];
  }

  return {
    goalType: matchedGoalType,
    funnelPlan,
    refinedGoal,
    keyMessages,
    successMetrics,
  };
}
