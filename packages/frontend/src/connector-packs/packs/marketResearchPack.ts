import { ConnectorPack } from '../types';

export const marketResearchPack: ConnectorPack = {
  id: 'market-research',
  name: 'Market Research',
  icon: 'Search',
  brandColor: 'from-violet-500 to-purple-600',
  description: 'Discover market gaps, content opportunities, and industry trends.',
  longDescription: 'Allow VIMO to track competitors, monitor industry trends, and identify content opportunities. Get weekly market briefings with actionable insights.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'intelligence_packs',
  provider: 'market-research',
  connectionType: 'none',
  isPopular: true,
  requirements: [
    { id: 'competitors', label: 'I know which companies or competitors to track', checked: false },
  ],
  capabilities: [
    { icon: 'Search', label: 'Monitor competitors' },
    { icon: 'TrendingUp', label: 'Track industry trends' },
    { icon: 'Target', label: 'Find market gaps' },
    { icon: 'Lightbulb', label: 'Discover opportunities' },
  ],
  whatVimoLearns: [
    { icon: 'Search', label: 'Competitor Activity' },
    { icon: 'TrendingUp', label: 'Industry Trends' },
    { icon: 'Target', label: 'Market Gaps' },
    { icon: 'BarChart3', label: 'Campaign Activity' },
  ],
  whatVimoGenerates: [
    { icon: 'FileText', label: 'Market Briefings' },
    { icon: 'Bell', label: 'Opportunity Alerts' },
    { icon: 'Target', label: 'Content Opportunities' },
    { icon: 'BarChart3', label: 'Weekly Competitor Reports' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Market Research',
      description: 'Tell VIMO which companies, competitors, and markets to track. We monitor activity and surface opportunities.',
      requirements: [
        { id: 'competitors', label: 'I know which companies or competitors to track', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Configure Your Market Research',
      description: 'Enter the companies, competitors, and markets you want VIMO to track.',
      instructionBullets: [
        'Enter competitor names and websites below (one per line)',
        'VIMO monitors posting frequency, content themes, and engagement',
        'Track campaign activity and industry trends',
        'Receive weekly market briefings with growth signals',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Companies to Track',
      description: 'List the companies, competitors, and markets you want VIMO to research.',
      credentialFields: [
        { key: 'companies', label: 'Companies / Competitors', placeholder: 'Acme Inc.\ncompetitor.com\n@competitor_handle\nIndustry: SaaS', isSecret: false, helpText: 'One per line — company names, URLs, social handles, or industries to track' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Setting Up Your Market Dashboard',
      description: 'VIMO is preparing your market research dashboard...',
      discoveryItems: [
        { icon: 'Search', label: 'Market signals tracked', value: 'Ongoing' },
        { icon: 'Bell', label: 'Alert types', value: '5' },
        { icon: 'FileText', label: 'Briefing frequency', value: 'Weekly' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'how_market',
      question: 'How does Market Research work?',
      answer: 'VIMO monitors competitor websites, social accounts, and industry trends to identify content opportunities, market gaps, and growth signals. You get weekly briefings with actionable recommendations.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Market Research active. VIMO monitors:',
    items: [
      { icon: 'Search', label: 'Competitors', value: 'Add in Intelligence' },
      { icon: 'TrendingUp', label: 'Industry trends', value: 'Daily scans' },
      { icon: 'Bell', label: 'Opportunities', value: 'Real-time' },
    ],
  },
  successActions: [
    { label: 'Add competitors to track', cta: 'Add Now', route: '/intelligence' },
    { label: 'View market insights dashboard', cta: 'Open Dashboard', route: '/intelligence' },
    { label: 'Create content from market gaps', cta: 'Create Content', route: '/content' },
  ],
  exampleOutputs: [
    'Weekly competitor activity briefings with growth signals',
    'Content opportunities based on market gaps',
    'Campaign activity alerts from competitors',
    'Industry trend reports with actionable recommendations',
  ],
};
