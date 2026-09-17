/**
 * CMO Playbooks — how a top marketing operator actually thinks, encoded.
 *
 * Distilled from current (2026) operator practice: short-form video
 * dominance, social-as-search, creator/human voice over polish, pillars with
 * ratios, hook-first retention, winner loops, cadence over volume, community
 * response speed, and signal-over-vanity measurement.
 *
 * Consumed two ways: the Marketing Director grounds opportunities in them
 * (see buildPlaybookBlock), and the assistant serves full playbooks through
 * the get_playbook tool. Plain data + pure functions — trivially testable.
 */
export interface CmoPlaybook {
  id: string;
  name: string;
  promise: string;
  problem: string;
  whenToUse: string[];
  steps: string[];
  metrics: string[];
  cadence: string;
}

const PLAYBOOKS: CmoPlaybook[] = [
  {
    id: 'rule-of-two',
    name: 'Rule of Two Platforms',
    promise: 'Own two platforms instead of being mediocre on six.',
    problem: 'Spreading thin produces filler everywhere and signal nowhere.',
    whenToUse: ['choosing platforms', 'starting out', 'low engagement everywhere', 'pillars'],
    steps: [
      'Pick ONE discovery platform (TikTok, Reels, Shorts, Pinterest) where strangers find you.',
      'Pick ONE relationship platform (LinkedIn, Threads, Reddit, email) where trust converts.',
      'Treat them as a pair: discovery builds the audience, relationship converts it.',
      'Park every other platform for 90 days. Revisit only with data.',
    ],
    metrics: ['Reach per platform', 'Profile visits from discovery', 'DMs from relationship'],
    cadence: 'Decide once per quarter.',
  },
  {
    id: 'pillars',
    name: 'Content Pillars 40/30/20/10',
    promise: 'Never wonder what to post again: 3–5 repeatable themes on rotation.',
    problem: 'Every post as a fresh creative brief burns teams out in weeks.',
    whenToUse: ['what should I post', 'content plan', 'inconsistent posting', 'new brand', 'pillars'],
    steps: [
      'Define 3–5 pillars, each answering a real buyer question in buyer words.',
      'Assign output ratios: 40% educate, 30% entertain, 20% inspire, 10% promote.',
      'Keep one pillar evergreen (searchable months from now).',
      'Write a weekly rotation down (Mon educate, Tue entertain, …) — paper beats memory.',
      'Review pillar performance every 30 days; change at most one pillar per month.',
    ],
    metrics: ['Posts per pillar', 'Saves per pillar', 'Follower growth per pillar'],
    cadence: 'Weekly rotation, monthly review.',
  },
  {
    id: 'hooks',
    name: 'Hook-First Short Video',
    promise: 'Earn the first 3 seconds and the algorithm does the rest.',
    problem: 'Slow openings and teacher-style intros get swiped past instantly.',
    whenToUse: ['video', 'reels', 'tiktok', 'shorts', 'retention', 'hooks', 'scripts'],
    steps: [
      'Open with a Proof Drop (screenshot/result) or an Investigator question — categorize the video in under 2 seconds.',
      'Never open with "in this video I will…" or a logo. Start mid-tension.',
      'Target 45–90 seconds of dense value; every second must earn its place.',
      'Burn captions in (most watch muted) and close with a next action or open loop.',
      'Keep visual identity consistent (framing, caption style) so viewers recognize you before they follow you.',
    ],
    metrics: ['3-second retention', 'Completion rate', 'Follows per view'],
    cadence: 'Every video, no exceptions.',
  },
  {
    id: 'social-search',
    name: 'Social Search Optimization',
    promise: 'Get discovered by people actively looking to buy.',
    problem: 'Buyers search TikTok/Instagram/YouTube first; invisible brands lose the click.',
    whenToUse: ['discovery', 'search', 'captions', 'hashtags', 'local business', 'search'],
    steps: [
      'Put the buyer question in the first caption line, in their exact words.',
      'Say the keyword out loud in the first 3 seconds (audio gets indexed).',
      'Add keyword-matched on-screen text; answer one question per asset.',
      'Pin a comment with the service description or FAQ answer.',
      'Treat keywords as more important than hashtags (still add 3–5 relevant ones).',
    ],
    metrics: ['Search-driven profile visits', 'Saves', 'DMs asking for specifics'],
    cadence: 'Every post.',
  },
  {
    id: 'cta-every-post',
    name: 'Every Post Earns Its CTA',
    promise: 'Views turn into conversations, conversations into customers.',
    problem: 'Content without a next step generates applause and zero business.',
    whenToUse: ['leads', 'conversion', 'cta', 'caption', 'low sales from social'],
    steps: [
      'End every asset with exactly one ask: comment prompt, DM ask, or link.',
      'Make the landing match the promise (no generic homepages).',
      'Reply to resulting comments/DMs within 2 hours (under 60 minutes for DMs).',
      'Track which CTAs produce conversations, then standardize the winners.',
    ],
    metrics: ['Comments per post', 'DMs per post', 'Link taps', 'Bookings/calls'],
    cadence: 'Every post; review CTA winners monthly.',
  },
  {
    id: 'winner-loop',
    name: 'Winner Repurpose Loop',
    promise: 'Turn one proven hit into a week of content instead of starting over.',
    problem: 'Teams abandon winners to chase new ideas; growth never compounds.',
    whenToUse: ['viral post', 'repurpose', 'winner', 'variations', 'cross-post'],
    steps: [
      'Identify the winner by saves/shares/watch-time (not likes). Name WHY it worked.',
      'Make 3 variations changing one variable each (hook, example, format).',
      'Adapt natively to 1–2 more platforms (never verbatim copy-paste).',
      'If budget exists, amplify the winner to a cold lookalike audience.',
      'Save the lesson (hook + format + topic) to brand memory.',
    ],
    metrics: ['Saves/shares of variations', 'Cost per result if amplified', 'Follower delta'],
    cadence: 'Whenever a post beats your median by 2x.',
  },
  {
    id: 'seventy-thirty',
    name: '70/30 Proven vs Experimental',
    promise: 'Steady growth plus a discovery engine, without gambling the channel.',
    problem: 'All-safe content plateaus; all-experiment content never compounds.',
    whenToUse: ['content mix', 'experiments', 'plateau', 'testing', 'calendar'],
    steps: [
      'Spend 70% of output on proven pillars and formats.',
      'Spend 30% on small, cheap, learnable experiments (one variable each).',
      'Promote experiments that beat the median into the proven rotation.',
      'Kill experiments that lose twice. No sunk-cost sequels.',
    ],
    metrics: ['Experiment hit rate', 'New winners per month', 'Median reach trend'],
    cadence: 'Weekly mix check.',
  },
  {
    id: 'response-speed',
    name: 'Community Response Speed',
    promise: 'Turn comments and DMs into a revenue function, not an afterthought.',
    problem: 'Unhandled comments teach the algorithm (and humans) that nobody is home.',
    whenToUse: ['comments', 'DMs', 'community', 'engagement dropping', 'replies'],
    steps: [
      'Answer comments within 2 hours, DMs within 60 minutes during the day.',
      'Mine comments for next content: questions become posts, pushback becomes clarity.',
      'Run comment-to-content loops: reply with a follow-up video idea, then make it.',
      'Staff the coverage or automate first acknowledgement with clear escalation.',
    ],
    metrics: ['Median response time', 'Comment-to-follower conversion', 'DMs opened'],
    cadence: 'Daily habit; audit weekly.',
  },
  {
    id: 'cadence',
    name: 'Sustainable Cadence',
    promise: '3–5 posts a week forever beats 7 a week for a month.',
    problem: 'Burnout schedules produce a burst, then silence — the algorithm forgets you.',
    whenToUse: ['burnout', 'consistency', 'schedule', 'how often', 'calendar', 'cadence'],
    steps: [
      'Pick a pace sustainable indefinitely: 3–5 posts/week for most small brands.',
      'Batch by pillar (all of one pillar in one sitting) — cuts production time nearly in half.',
      'Film 3 videos in 45 minutes: same location, same lighting, different hooks.',
      'Protect the streak over the spike. Never sacrifice sleep for a trend.',
    ],
    metrics: ['Weeks without a miss', 'Minutes per asset', 'Burnout signals (missed weeks)'],
    cadence: 'Set quarterly; protect weekly.',
  },
  {
    id: 'signal-metrics',
    name: 'Signal Over Vanity',
    promise: 'Report numbers that predict revenue, not applause.',
    problem: 'Likes and follower counts comfort while the business starves.',
    whenToUse: ['analytics', 'report', 'metrics', 'ROI', 'what to measure', 'dashboard'],
    steps: [
      'Lead with saves, shares, watch-time, DM volume, comment velocity.',
      'Track follower growth RATE (not total) and reach as % of followers.',
      'Tie to business: profile visits, link taps, bookings, cost per lead.',
      'Ignore single-post viral spikes; judge by 30-day medians per pillar.',
    ],
    metrics: ['Saves/shares per post', 'DMs per week', 'Cost per lead', 'Branded search lift'],
    cadence: 'Weekly glance, monthly deep review.',
  },
  {
    id: 'authentic-voice',
    name: 'Human Voice, AI Hands',
    promise: 'AI speed without AI slop: production by machine, personality by human.',
    problem: 'Generic AI output is spreading — audiences and algorithms both discount it.',
    whenToUse: ['AI content', 'captions', 'voice', 'authentic', 'UGC', 'slop'],
    steps: [
      'Let AI draft structure, hooks, transcripts, and repurposing — never final voice.',
      'Pass every AI draft through the voice check: would a customer recognize this as you?',
      'Prefer founder/employee/customer faces over polished brand theater (3–5x reach on LinkedIn, 2–4x on Reels/TikTok).',
      'Show process and proof (receipts, before/afters, mistakes) over claims.',
    ],
    metrics: ['Comment quality (specific vs generic)', 'Saves on founder-led posts', 'Voice complaints (zero is the goal)'],
    cadence: 'Every AI-assisted asset.',
  },
];

export function listPlaybooks(): Array<{ id: string; name: string; promise: string }> {
  return PLAYBOOKS.map((p) => ({ id: p.id, name: p.name, promise: p.promise }));
}

/**
 * Match a topic to the best playbook — deliberately conservative.
 *
 * Order: exact id/name → curated trigger phrase contained in the query →
 * keyword overlap (needs 2+ distinct words so a single shared word like
 * "post" can never match). Anything else returns null so the agent lists
 * options instead of confidently serving the wrong playbook.
 */
export function getPlaybook(topic: string): CmoPlaybook | null {
  const q = topic.trim().toLowerCase();
  if (!q) return null;
  const direct = PLAYBOOKS.find((p) => p.id === q || p.name.toLowerCase() === q);
  if (direct) return direct;

  for (const playbook of PLAYBOOKS) {
    for (const trigger of playbook.whenToUse) {
      const t = trigger.toLowerCase().trim();
      if (t.length > 4 && q.includes(t)) return playbook;
    }
  }

  const words = [...new Set(q.split(/[^a-z]+/).filter((w) => w.length > 2))];
  if (words.length === 0) return null;

  let best: CmoPlaybook | null = null;
  let bestScore = 0;
  for (const playbook of PLAYBOOKS) {
    const triggers = playbook.whenToUse.join(' ').toLowerCase();
    let score = 0;
    for (const word of words) {
      if (triggers.includes(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = playbook;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Compact block for LLM prompts (Director synthesis). Full detail stays behind get_playbook. */
export function buildPlaybookBlock(): string {
  const lines = PLAYBOOKS.map((p) => `- ${p.name}: ${p.promise}`);
  return `Proven CMO playbooks (ground at least one opportunity in one explicitly):\n${lines.join('\n')}`;
}
