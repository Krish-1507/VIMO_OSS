/**
 * Social Accounts Pack
 *
 * A unified connector pack that represents all social platforms.
 * The user connects individual platforms via OAuth through VIMO's
 * secure integration layer. Each platform uses its own OAuth flow.
 */

import { ConnectorPack } from '../types';

export const socialAccountsPack: ConnectorPack = {
  id: 'social-accounts',
  name: 'Social Accounts',
  icon: 'Zap',
  brandColor: 'from-teal-500 to-emerald-500',
  description: 'Connect all your social platforms through a secure direct connection.',
  difficulty: 'Easy',
  estimatedSetupTime: '5 minutes',
  category: 'social_accounts',
  provider: 'vimosocial',
  connectionType: 'oauth',
  requirements: [],
  capabilities: [
    { icon: 'FileText', label: 'Publish Content' },
    { icon: 'Calendar', label: 'Schedule Posts' },
    { icon: 'MessageCircle', label: 'Reply To Comments' },
    { icon: 'BarChart3', label: 'Read Analytics' },
    { icon: 'TrendingUp', label: 'Track Growth' },
  ],
  whatVimoLearns: [
    { icon: 'Instagram', label: 'Social Platforms' },
    { icon: 'Users', label: 'Audience Data' },
    { icon: 'BarChart3', label: 'Performance Metrics' },
    { icon: 'MessageCircle', label: 'Engagement History' },
  ],
  whatVimoGenerates: [
    { icon: 'FileText', label: 'Social Posts' },
    { icon: 'Calendar', label: 'Content Schedules' },
    { icon: 'BarChart3', label: 'Analytics Reports' },
    { icon: 'MessageCircle', label: 'Engagement Replies' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Your Social Accounts',
      description: 'VIMO will guide you through a quick setup so it can publish content, analyze performance, and help grow your brand.',
      requirements: [
        { id: 'ready', label: 'I want to connect my social accounts to VIMO', checked: false },
      ],
    },
    {
      id: 'connect_platforms',
      type: 'instructions',
      title: 'Connect',
      description: 'VIMO connects securely to each platform individually. You will authorize VIMO on each platform you want to connect.',
      instructionBullets: [
        'Select which platforms you want to connect (Instagram, Facebook, LinkedIn, etc.)',
        'Click Connect to open the platform authorization page',
        'Log in and authorize VIMO on each platform',
        'VIMO will automatically detect your connected accounts',
      ],
    },
    {
      id: 'discover',
      type: 'oauth_connect',
      title: 'Connect Your Platforms',
      description: 'Click each platform below to authorize VIMO. A popup will open for you to log in.',
    },
    {
      id: 'success',
      type: 'test_connection',
      title: 'Accounts Connected',
      description: 'Your social platforms are now connected. VIMO can publish, schedule, analyze, and engage across them automatically.',
      testChecks: [
        { label: 'Publishing enabled', key: 'publish' },
        { label: 'Scheduling enabled', key: 'schedule' },
        { label: 'Analytics enabled', key: 'analytics' },
        { label: 'Engagement enabled', key: 'engagement' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_is_vimosocial',
      question: 'What is VIMO Social?',
      answer: 'VIMO Social is VIMO\'s secure connector layer for connecting your social accounts. It handles all the technical complexity so you never need to deal with API keys, tokens, or developer portals.',
    },
    {
      id: 'which_platforms',
      question: 'Which platforms can I connect?',
      answer: 'Instagram, Facebook, LinkedIn, X (Twitter), TikTok, YouTube, Pinterest, Threads, and Bluesky.',
    },
    {
      id: 'disconnect',
      question: 'Can I disconnect later?',
      answer: 'Yes. Go to your Social Accounts dashboard at any time to disconnect individual platforms or remove the connection entirely.',
    },
  ],
  validationRules: [],
  postConnectionValue: {
    title: 'Social Accounts Connected',
    metrics: [
      { label: 'Connected', value: '0', icon: 'CheckCircle2' },
      { label: 'Platforms', value: '9', icon: 'Globe' },
      { label: 'Capabilities', value: '5', icon: 'Zap' },
    ],
    suggestedAction: {
      label: 'Go to Social Dashboard',
      cta: 'Open Social Dashboard',
    },
  },
};
