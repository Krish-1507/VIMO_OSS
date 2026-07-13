/**
 * Content Variety System
 *
 * Ensures content diversity by selecting content types based on
 * recent posting history and frequency weights. Includes a library
 * of hook templates per content type.
 */

export interface ContentType {
  label: string;
  hookStyle: string;
  structure: string;
  emojiDensity: 'none' | 'low' | 'medium' | 'heavy';
  captionLength: 'short' | 'medium' | 'long';
  frequency: number;
}

export const CONTENT_TYPES: Record<string, ContentType> = {
  educational: {
    label: 'Educational',
    hookStyle: 'question or surprising fact',
    structure: 'hook → 3 points → takeaway → CTA',
    emojiDensity: 'low',
    captionLength: 'medium',
    frequency: 0.25,
  },
  storytelling: {
    label: 'Behind the Scenes',
    hookStyle: 'personal story opener',
    structure: 'situation → conflict → resolution → lesson',
    emojiDensity: 'medium',
    captionLength: 'long',
    frequency: 0.20,
  },
  promotional: {
    label: 'Product/Service',
    hookStyle: 'problem-solution',
    structure: 'pain point → your solution → proof → offer → CTA',
    emojiDensity: 'medium',
    captionLength: 'medium',
    frequency: 0.15,
  },
  engagement: {
    label: 'Engagement Bait',
    hookStyle: 'direct question or opinion',
    structure: 'bold statement → context → ask for comment',
    emojiDensity: 'heavy',
    captionLength: 'short',
    frequency: 0.20,
  },
  social_proof: {
    label: 'Social Proof',
    hookStyle: 'result or testimonial',
    structure: 'result → story → your role → CTA',
    emojiDensity: 'low',
    captionLength: 'medium',
    frequency: 0.10,
  },
  trending: {
    label: 'Trend/Timely',
    hookStyle: 'news hook or cultural reference',
    structure: 'hook → trend connection → your take → CTA',
    emojiDensity: 'medium',
    captionLength: 'short',
    frequency: 0.10,
  },
};

export const HOOK_LIBRARY: Record<string, string[]> = {
  educational: [
    'Nobody talks about {topic} but here is what {years} of experience taught me:',
    '{number} things I wish I knew before {action}:',
    'The {industry} secret that {result}:',
    'This is why {common belief} is wrong:',
    'If you are {situation}, read this.',
    'Stop {common_mistake} — here is what to do instead:',
    'The {number}-step system to {goal} in {timeframe}:',
    'Here is why most {industry} strategies fail (and how to fix it):',
    'I tried {method} for {timeframe} and here is what happened:',
    'The one thing every {audience} needs to know about {topic}:',
  ],
  storytelling: [
    'Last {timeperiod}, something happened that changed how I think about {topic}.',
    'I made a mistake that cost me {consequence}. Here is what I learned.',
    'Two years ago I was {situation}. Today {result}. Here is the gap:',
    'A {client_type} walked in and said something I will never forget.',
    'I almost gave up on {goal}. Then {turning_point} happened.',
    'The moment I realized everything I knew about {topic} was wrong:',
    'We took a bet on {idea}. Here is how it turned out:',
    'Day one vs. year one — the reality nobody talks about:',
    'The email/message that changed how I work:',
    'If these {industry} walls could talk, they would tell you {lesson}:',
  ],
  engagement: [
    'Hot take: {opinion}. Agree or disagree? 👇',
    'Be honest — do you {action}? Comment below.',
    'The question everyone in {industry} is afraid to answer:',
    '{option_a} or {option_b}? Your answer says everything about you.',
    'Rate this {topic} take from 1-10. I will go first:',
    'Tag someone who needs to hear this 👇',
    'What is the one piece of advice you would give to someone starting {action}?',
    'Unpopular opinion: {opinion}. Change my mind.',
    'Which {category} is your favorite? I am team {option}.',
    'Fill in the blank: "{prompt}" — go!',
  ],
  promotional: [
    'If you are struggling with {problem}, you need to hear this.',
    'We fixed {problem} so you do not have to.',
    '{number} clients came to us with {problem}. Here is what we did:',
    'This is the tool/system/method I wish I had when {situation}:',
    '{problem} is costing you {consequence}. Here is the fix:',
    'Most people spend {time} on {task}. We cut it to {shorter_time}.',
    'What if you could {desired_outcome} without {pain_point}?',
    'We built {product} because {reason}. Here is why it matters:',
    'See the difference between {before} and {after}.',
    'Limited time: {offer} for the first {number} {customers}.',
  ],
  social_proof: [
    '{client} went from {before} to {after} in {timeframe}.',
    'Real result: {metric}. Here is exactly how.',
    'This is what {number} {clients} all had in common:',
    'Case study: How {client} achieved {result} with {solution}.',
    'Before and after: {metric_change}. No filters, no tricks.',
    '{number} {customers} trust us with {asset}. Here is why:',
    'The average {client_type} sees {result} in {timeframe}. Here is the playbook:',
    '{client} said it best: "{quote}"',
    'We hit {milestone}. Here is the exact strategy:',
    'This {metric} proves that {insight}:',
  ],
  trending: [
    'Everyone is talking about {trend}. Here is what they are getting wrong.',
    '{trend} changed {industry} forever. Here is what you need to know:',
    'Is {trend} actually worth it? We tested it so you do not have to.',
    'The {trend} debate is missing one key thing:',
    '{trend} is blowing up. Here is how {audience} can capitalize:',
    'Every {industry} creator is jumping on {trend}. Should you?',
    '{news_event} just happened. Here is what it means for {industry}:',
    'I analyzed {trend} for {timeframe}. Here is the truth:',
    'Forget {old_trend}. {new_trend} is the real opportunity:',
    '{trend} is not going away. Here is your {timeframe} action plan:',
  ],
};

const CONTENT_TYPE_KEYS = Object.keys(CONTENT_TYPES);

interface RecentPostInfo {
  contentType?: string;
}

export interface SelectContentTypeOptions {
  weights?: Record<string, number>;
  avoidContentTypes?: string[];
}

/**
 * Selects the next content type based on recent posting history and frequency weights.
 * Ensures no content type repeats more than once in the last 5 posts.
 * Prioritizes underrepresented types using their frequency weights.
 *
 * If `options.weights` is provided, those weights MULTIPLY the per-type frequency
 * weight (e.g. a weight of 2.0 for a type makes it twice as likely).
 * If `options.avoidContentTypes` is provided, those types are excluded entirely.
 */
export function selectContentType(
  recentPosts: RecentPostInfo[],
  options: SelectContentTypeOptions = {}
): string {
  const extraWeights = options.weights || {};
  const avoid = new Set(options.avoidContentTypes || []);

  // Get the last 5 post types (filter out posts without contentType)
  const recentTypes = recentPosts
    .filter((p) => p.contentType)
    .map((p) => p.contentType as string)
    .slice(-5);

  // If we have no history, pick based on frequency weights
  if (recentTypes.length === 0) {
    return weightedRandom(
      CONTENT_TYPE_KEYS.filter((k) => !avoid.has(k)).map((k) => ({
        key: k,
        weight: (CONTENT_TYPES[k].frequency || 0.1) * (extraWeights[k] ?? 1),
      }))
    );
  }

  // Build a score for each content type based on:
  // 1. How recently it was used (penalize recent usage)
  // 2. Its frequency weight
  // 3. Optional adaptive weights supplied by the caller
  const scores: Record<string, number> = {};

  for (const key of CONTENT_TYPE_KEYS) {
    if (avoid.has(key)) {
      scores[key] = 0;
      continue;
    }
    let score = CONTENT_TYPES[key].frequency * (extraWeights[key] ?? 1);

    // Penalize for recent appearances
    const appearanceCount = recentTypes.filter((t) => t === key).length;
    if (appearanceCount > 0) {
      // Reduce score proportionally to how often it appears recently
      score *= Math.pow(0.3, appearanceCount);

      // If it appeared in the last 2 posts, penalize more heavily
      const lastTwo = recentTypes.slice(-2);
      if (lastTwo.includes(key)) {
        score *= 0.2;
      }
    }

    scores[key] = score;
  }

  // Weighted random selection
  return weightedRandom(
    CONTENT_TYPE_KEYS.filter((k) => !avoid.has(k)).map((key) => ({
      key,
      weight: Math.max(scores[key], 0.01),
    }))
  );
}

function weightedRandom(items: { key: string; weight: number }[]): string {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of items) {
    random -= item.weight;
    if (random <= 0) {
      return item.key;
    }
  }

  return items[items.length - 1].key;
}

/**
 * Picks a random hook template from the hook library for the given content type.
 */
export function getRandomHook(contentType: string): string {
  const hooks = HOOK_LIBRARY[contentType];
  if (!hooks || hooks.length === 0) {
    return '';
  }
  return hooks[Math.floor(Math.random() * hooks.length)];
}
