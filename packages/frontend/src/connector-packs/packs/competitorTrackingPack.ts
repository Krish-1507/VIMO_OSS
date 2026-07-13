import { ConnectorPack } from '../types';

export const competitorTrackingPack: ConnectorPack = {
  id: 'competitor-tracking',
  name: 'Competitor Tracking',
  icon: 'Eye',
  brandColor: 'from-amber-500 to-orange-600',
  description: 'Monitor competitors and discover market opportunities.',
  longDescription: 'Track your competitors\' social activity, content themes, and growth signals. Get weekly briefings and opportunity alerts.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'intelligence_packs',
  provider: 'competitor-tracking',
  connectionType: 'none',
  isPopular: true,
  requirements: [
    { id: 'competitors', label: 'I know which competitors I want to track', checked: false },
  ],
  capabilities: [
    { icon: 'Eye', label: 'Monitor competitors' },
    { icon: 'BarChart3', label: 'Track posting frequency' },
    { icon: 'FileText', label: 'Analyze content themes' },
    { icon: 'TrendingUp', label: 'Detect growth signals' },
  ],
  whatVimoLearns: [
    { icon: 'Eye', label: 'Competitor Activity' },
    { icon: 'BarChart3', label: 'Posting Frequency' },
    { icon: 'FileText', label: 'Content Themes' },
    { icon: 'TrendingUp', label: 'Growth Signals' },
  ],
  whatVimoGenerates: [
    { icon: 'BarChart3', label: 'Competitor Insights' },
    { icon: 'Bell', label: 'Opportunity Alerts' },
    { icon: 'Target', label: 'Market Gap Analysis' },
    { icon: 'FileText', label: 'Weekly Briefings' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Competitor Tracking',
      description: 'Tell VIMO which competitors to track. We monitor their activity and alert you to opportunities.',
      requirements: [
        { id: 'competitors', label: 'I know which competitors I want to track', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Add Competitors',
      description: 'Enter your competitors\' names or social handles so VIMO can start monitoring.',
      instructionBullets: [
        'Enter your competitors\' names or social handles below (one per line)',
        'VIMO will start monitoring their activity and content',
        'You will receive weekly competitor briefings with insights',
        'You can add more competitors anytime from the Intelligence page',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Competitor Details',
      description: 'List the competitors you want VIMO to track. Include their social handles or website URLs.',
      credentialFields: [
        { key: 'competitors', label: 'Competitor Names / Handles', placeholder: '@competitor1\ncompetitor.com\n@competitor2', isSecret: false, helpText: 'One per line — social handles (@handle) or website URLs' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Setting Up Monitoring',
      description: 'VIMO is preparing your competitor tracking dashboard...',
      discoveryItems: [
        { icon: 'Eye', label: 'Competitors being tracked', value: 'Add in Intelligence' },
        { icon: 'BarChart3', label: 'Metrics monitored', value: '12' },
        { icon: 'Bell', label: 'Alert types', value: '6' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'how_tracking',
      question: 'How does competitor tracking work?',
      answer: 'VIMO monitors your competitors\' public social activity, posting frequency, content themes, and engagement trends. You get weekly briefings and real-time alerts.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Competitor Tracking ready. What VIMO monitors:',
    items: [
      { icon: 'Eye', label: 'Posting frequency', value: 'Daily scans' },
      { icon: 'FileText', label: 'Content themes', value: 'Auto-detected' },
      { icon: 'TrendingUp', label: 'Growth signals', value: 'Real-time' },
    ],
  },
  successActions: [
    { label: 'Add your first competitor', cta: 'Add Competitor', route: '/intelligence' },
    { label: 'View competitor insights dashboard', cta: 'Open Dashboard', route: '/intelligence' },
    { label: 'Schedule weekly briefing', cta: 'Schedule', route: '/settings' },
  ],
  exampleOutputs: [
    'Weekly competitor activity briefings',
    'Content gap analysis: what they post vs. what you post',
    'Alert when competitors launch new campaigns',
    'Trend analysis: what content themes are working for them',
  ],
};
