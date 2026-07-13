import { ConnectorPack } from '../types';

export const seoPack: ConnectorPack = {
  id: 'seo',
  name: 'SEO Intelligence',
  icon: 'Search',
  brandColor: 'from-blue-500 to-blue-700',
  description: 'Discover content opportunities and track search trends.',
  longDescription: 'Track keywords, monitor rankings, and discover content opportunities. Get weekly SEO briefings with actionable recommendations.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'intelligence_packs',
  provider: 'seo',
  connectionType: 'none',
  requirements: [
    { id: 'website', label: 'I have a website I want to track', checked: false },
  ],
  capabilities: [
    { icon: 'Search', label: 'Track keywords' },
    { icon: 'BarChart3', label: 'Monitor rankings' },
    { icon: 'FileText', label: 'Find content opportunities' },
    { icon: 'TrendingUp', label: 'Spot search trends' },
  ],
  whatVimoLearns: [
    { icon: 'Search', label: 'Keyword Rankings' },
    { icon: 'BarChart3', label: 'Search Trends' },
    { icon: 'Target', label: 'Content Opportunities' },
    { icon: 'TrendingUp', label: 'Competitor SEO' },
  ],
  whatVimoGenerates: [
    { icon: 'FileText', label: 'Weekly SEO Briefings' },
    { icon: 'Search', label: 'Recommended Articles' },
    { icon: 'Target', label: 'Keyword Opportunities' },
    { icon: 'BarChart3', label: 'SEO Reports' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'SEO Intelligence',
      description: 'Let VIMO help you discover content opportunities and track your search performance.',
      requirements: [
        { id: 'website', label: 'I have a website I want to track', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Connect Your Website',
      description: 'Enter your website URL so VIMO can start tracking SEO performance.',
      instructionBullets: [
        'Enter your website URL below',
        'VIMO will identify relevant keywords for your industry',
        'You will receive weekly SEO briefings with actionable recommendations',
        'Adjust keywords anytime from the Intelligence page',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Website URL',
      description: 'Paste your website URL so VIMO can track keywords and search trends.',
      credentialFields: [
        { key: 'websiteUrl', label: 'Website URL', placeholder: 'https://yourwebsite.com', isSecret: false, helpText: 'Your primary website URL (e.g., https://acme.com)' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'how_seo',
      question: 'How does SEO Intelligence work?',
      answer: 'VIMO tracks keyword rankings, search trends, and content opportunities for your industry. You get weekly briefings with actionable recommendations.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'SEO Intelligence active. VIMO will track:',
    items: [
      { icon: 'Search', label: 'Keywords tracked', value: 'Auto-detected' },
      { icon: 'FileText', label: 'Content opportunities', value: 'Weekly' },
      { icon: 'TrendingUp', label: 'Search trends', value: 'Real-time' },
    ],
  },
  successActions: [
    { label: 'View keyword opportunities', cta: 'View Keywords', route: '/intelligence' },
    { label: 'Create content for trending topics', cta: 'Create Content', route: '/content' },
    { label: 'Schedule weekly SEO briefing', cta: 'Schedule', route: '/settings' },
  ],
  exampleOutputs: [
    'Weekly SEO briefing with keyword ranking changes',
    'Content opportunities based on search trends',
    'Recommended topics with high search potential',
    'Competitor keyword gap analysis',
  ],
};
