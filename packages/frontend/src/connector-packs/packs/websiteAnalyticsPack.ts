import { ConnectorPack } from '../types';

export const websiteAnalyticsPack: ConnectorPack = {
  id: 'website-analytics',
  name: 'Website Analytics',
  icon: 'BarChart3',
  brandColor: 'from-teal-500 to-emerald-500',
  description: 'Understand your website traffic and content performance.',
  longDescription: 'Connect your website analytics to understand what content drives traffic, engagement, and conversions.',
  difficulty: 'Easy',
  estimatedSetupTime: '3 minutes',
  category: 'intelligence_packs',
  provider: 'website-analytics',
  connectionType: 'none',
  requirements: [
    { id: 'website', label: 'I have a website', checked: false },
  ],
  capabilities: [
    { icon: 'BarChart3', label: 'Track traffic' },
    { icon: 'Users', label: 'Understand audience' },
    { icon: 'FileText', label: 'Analyze top content' },
    { icon: 'TrendingUp', label: 'Spot trends' },
  ],
  whatVimoLearns: [
    { icon: 'BarChart3', label: 'Traffic Sources' },
    { icon: 'Users', label: 'Audience Behavior' },
    { icon: 'FileText', label: 'Top Content' },
    { icon: 'TrendingUp', label: 'Content Performance' },
  ],
  whatVimoGenerates: [
    { icon: 'FileText', label: 'Traffic Reports' },
    { icon: 'Megaphone', label: 'Content Recommendations' },
    { icon: 'BarChart3', label: 'Performance Insights' },
    { icon: 'Lightbulb', label: 'Growth Opportunities' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Website Analytics',
      description: 'Connect your analytics so VIMO can track your content performance.',
      requirements: [
        { id: 'website', label: 'I have a website', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Connect Your Analytics',
      description: 'Enter your website details so VIMO can track content performance.',
      instructionBullets: [
        'Enter your website URL and your analytics tool below',
        'VIMO will connect to your analytics platform',
        'We start tracking your top content and traffic sources',
        'Get weekly performance reports with actionable insights',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Website Details',
      description: 'Enter your website URL and analytics tool so VIMO can start tracking.',
      credentialFields: [
        { key: 'websiteUrl', label: 'Website URL', placeholder: 'https://yourwebsite.com', isSecret: false, helpText: 'Your primary website URL' },
        { key: 'analyticsTool', label: 'Analytics Tool', placeholder: 'e.g., Google Analytics, Plausible, Fathom', isSecret: false, helpText: 'Which analytics platform do you use?' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'how_analytics',
      question: 'How does Website Analytics work?',
      answer: 'VIMO analyzes your website traffic, top-performing content, and audience behavior to provide insights and content recommendations.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Website Analytics connected. VIMO is analyzing:',
    items: [
      { icon: 'BarChart3', label: 'Monthly visitors', value: 'Detecting...' },
      { icon: 'FileText', label: 'Top pages', value: 'Analyzing...' },
      { icon: 'Users', label: 'Traffic sources', value: 'Tracking...' },
    ],
  },
  successActions: [
    { label: 'View traffic insights', cta: 'Open Analytics', route: '/analytics' },
    { label: 'Create content for top topics', cta: 'Create Content', route: '/content' },
    { label: 'Schedule weekly performance report', cta: 'Schedule', route: '/settings' },
  ],
  exampleOutputs: [
    'Weekly traffic and engagement reports',
    'Content recommendations based on top-performing pages',
    'Audience insight summaries',
    'Growth opportunity alerts',
  ],
};
