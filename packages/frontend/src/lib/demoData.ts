import type { DemoData } from './demoMode';
import type { ActivityItem } from '../components/dashboard/ActivityFeed';

// Sample transparency feed — proves the autonomous loop end-to-end.
export const DEMO_ACTIVITY: ActivityItem[] = [
  {
    id: 'demo-act-1',
    kind: 'research',
    title: 'Researched trends',
    description: 'Scaned TikTok, Instagram, and your competitors for the week.',
    why: 'Cozy autumn content is rising 3.2k posts/week — a timely hook for a home-goods brand.',
    timestamp: (() => new Date(Date.now() - 1000 * 60 * 18).toISOString())(),
    status: 'done',
  },
  {
    id: 'demo-act-2',
    kind: 'strategy',
    title: 'Built this week’s plan',
    description: 'Drafted 5 posts across Instagram, TikTok, and LinkedIn tuned to your voice.',
    why: 'Your audience engages most with behind-the-scenes and sustainability stories.',
    timestamp: (() => new Date(Date.now() - 1000 * 60 * 16).toISOString())(),
    status: 'done',
  },
  {
    id: 'demo-act-3',
    kind: 'content',
    title: 'Drafted 5 posts',
    description: 'Including the linen-candle launch and a zero-waste cushion replay.',
    why: 'Reusing your top-performing angle (zero waste) reliably lifts saves and shares.',
    timestamp: (() => new Date(Date.now() - 1000 * 60 * 14).toISOString())(),
    status: 'done',
  },
  {
    id: 'demo-act-4',
    kind: 'publish',
    title: 'Published a post',
    description: 'Behind the scenes of our new linen candle collection 🕯️',
    why: 'Scheduled for 6pm when your followers are most active (Thu evening).',
    timestamp: (() => new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString())(),
    status: 'done',
  },
  {
    id: 'demo-act-5',
    kind: 'engagement',
    title: 'Replied to 214 comments',
    description: 'Answered shipping and product questions in your brand voice.',
    why: 'Fast replies within 1 hour protect engagement rate and build trust.',
    timestamp: (() => new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString())(),
    status: 'done',
  },
  {
    id: 'demo-act-6',
    kind: 'autopilot',
    title: 'Autopilot is running',
    description: 'Watching engagement on the new post and queuing the next one.',
    why: 'Continuous monitoring lets VIMO catch spikes and post while momentum is high.',
    timestamp: (() => new Date(Date.now() - 1000 * 60 * 20).toISOString())(),
    status: 'monitoring',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sample "Demo" data. Clearly fictional — this is what a brand would look like
// after VIMO has been helping them for a few weeks. Used only in Demo Mode.
// ─────────────────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3600000).toISOString();
}

export const DEMO_DATA: DemoData = {
  account: {
    id: 'demo-account',
    name: 'Demo Marketer',
    brand: 'Aurora & Co.',
    email: 'demo@vimo.app',
    initials: 'DM',
  },

  brand: {
    name: 'Aurora & Co.',
    tagline: 'Sustainable home goods that feel like a hug for your space.',
    industry: 'Home & Lifestyle',
    voice: 'Warm, playful, and genuinely helpful — never salesy.',
  },

  connectedPlatforms: [
    { provider: 'instagram', name: 'Instagram', label: 'Instagram', color: 'from-pink-500 to-purple-600' },
    { provider: 'linkedin', name: 'LinkedIn', label: 'LinkedIn', color: 'from-blue-600 to-blue-800' },
    { provider: 'tiktok', name: 'TikTok', label: 'TikTok', color: 'from-gray-900 to-rose-400' },
    { provider: 'youtube', name: 'YouTube', label: 'YouTube', color: 'from-red-600 to-red-800' },
    { provider: 'notion', name: 'Notion', label: 'Notion', color: 'from-gray-800 to-gray-900' },
    { provider: 'canva', name: 'Canva', label: 'Canva', color: 'from-teal-400 to-cyan-600' },
  ],

  posts: [
    {
      id: 'demo-post-1',
      platform: 'instagram',
      platformLabel: 'Instagram',
      text: 'Behind the scenes of our new linen candle collection 🕯️ Which scent would you bring home first?',
      thumbnailColor: 'from-rose-400 to-orange-300',
      likes: 4820,
      comments: 312,
      shares: 184,
      publishedAt: daysAgo(2),
      status: 'published',
    },
    {
      id: 'demo-post-2',
      platform: 'tiktok',
      platformLabel: 'TikTok',
      text: 'We turned 1 old bedsheet into 3 brand-new cushion covers. Zero waste, 100% cozy. 🌿',
      thumbnailColor: 'from-emerald-400 to-teal-300',
      likes: 12840,
      comments: 901,
      shares: 2240,
      publishedAt: daysAgo(5),
      status: 'published',
    },
    {
      id: 'demo-post-3',
      platform: 'linkedin',
      platformLabel: 'LinkedIn',
      text: 'How we grew Aurora & Co. from a kitchen table to 50k fans — without a single ad. A look at the playbook our team actually uses.',
      thumbnailColor: 'from-blue-500 to-indigo-400',
      likes: 1120,
      comments: 88,
      shares: 240,
      publishedAt: daysAgo(8),
      status: 'published',
    },
    {
      id: 'demo-post-4',
      platform: 'instagram',
      platformLabel: 'Instagram',
      text: 'New drop this Friday ✨ Save this post so you don\'t miss the launch livestream.',
      thumbnailColor: 'from-violet-400 to-fuchsia-300',
      likes: 0,
      comments: 0,
      shares: 0,
      publishedAt: daysAgo(0),
      status: 'scheduled',
    },
  ],

  opportunities: [
    {
      id: 'demo-opp-1',
      type: 'trend_to_capitalize',
      title: 'A "cozy autumn" trend is rising on TikTok — ride it now',
      description:
        'VIMO spotted 3.2k new posts about cozy autumn homes this week. Aurora & Co. has 2 draft videos that fit perfectly. Posting in the next 24 hours could capture the wave.',
      potentialImpact: 'Est. +18k reach',
      urgency: 'act_now',
      actionLabel: 'Review draft',
      actionType: 'navigate',
      actionPayload: { route: '/library' },
      isActedOn: false,
      detectedAt: hoursAgo(3),
    },
    {
      id: 'demo-opp-2',
      type: 'engagement_needed',
      title: '214 comments are waiting for a reply',
      description:
        'Your last Instagram post is getting love, but 214 comments are unanswered. A quick, on-brand reply can turn fans into customers.',
      potentialImpact: 'Protects engagement rate',
      urgency: 'act_today',
      actionLabel: 'Open inbox',
      actionType: 'navigate',
      actionPayload: { route: '/engagement' },
      isActedOn: false,
      detectedAt: hoursAgo(9),
    },
    {
      id: 'demo-opp-3',
      type: 'content_ready',
      title: 'This week\'s content plan is ready for your approval',
      description:
        'VIMO drafted 5 posts across Instagram, TikTok, and LinkedIn tuned to your brand voice. Approve them and they go straight to your scheduler.',
      potentialImpact: 'Saves ~2 hours',
      urgency: 'act_this_week',
      actionLabel: 'Approve plan',
      actionType: 'navigate',
      actionPayload: { route: '/campaigns' },
      isActedOn: false,
      detectedAt: daysAgo(1),
    },
  ],

  analytics: {
    followers: 51280,
    followersDelta: 4.2,
    engagement: 6.8,
    posts: 142,
    reach: 312000,
    trend: [
      { label: 'Mon', value: 42 },
      { label: 'Tue', value: 55 },
      { label: 'Wed', value: 48 },
      { label: 'Thu', value: 71 },
      { label: 'Fri', value: 88 },
      { label: 'Sat', value: 64 },
      { label: 'Sun', value: 79 },
    ],
    platforms: [
      { platform: 'instagram', label: 'Instagram', followers: 22400, color: 'from-pink-500 to-purple-600' },
      { platform: 'tiktok', label: 'TikTok', followers: 16800, color: 'from-gray-900 to-rose-400' },
      { platform: 'youtube', label: 'YouTube', followers: 8100, color: 'from-red-600 to-red-800' },
      { platform: 'linkedin', label: 'LinkedIn', followers: 3980, color: 'from-blue-600 to-blue-800' },
    ],
  },

  comments: [
    {
      id: 'demo-cmt-1',
      author: 'jess_loves_home',
      avatarColor: 'bg-rose-400',
      text: 'Okay the linen candles are GORGEOUS. Do you ship to Canada? 🇨🇦',
      platformLabel: 'Instagram',
      responded: false,
      createdAt: hoursAgo(2),
    },
    {
      id: 'demo-cmt-2',
      author: 'minimal.max',
      avatarColor: 'bg-emerald-400',
      text: 'The zero-waste cushion video got me to finally order. Thank you!',
      platformLabel: 'TikTok',
      responded: true,
      createdAt: hoursAgo(6),
    },
    {
      id: 'demo-cmt-3',
      author: 'studio.ren',
      avatarColor: 'bg-violet-400',
      text: 'Would love a behind-the-scenes on how the team sources fabric 🤍',
      platformLabel: 'Instagram',
      responded: false,
      createdAt: hoursAgo(20),
    },
  ],

  scheduled: [
    {
      id: 'demo-sched-1',
      platformLabel: 'Instagram',
      platformColor: 'from-pink-500 to-purple-600',
      text: 'New drop this Friday ✨ Save this post so you don\'t miss the launch livestream.',
      scheduledFor: daysAgo(-1),
      status: 'queued',
    },
    {
      id: 'demo-sched-2',
      platformLabel: 'LinkedIn',
      platformColor: 'from-blue-600 to-blue-800',
      text: 'We wrote down the 5 lessons from scaling a sustainable brand — would anyone want the full breakdown?',
      scheduledFor: daysAgo(-3),
      status: 'pending_approval',
    },
  ],
};
