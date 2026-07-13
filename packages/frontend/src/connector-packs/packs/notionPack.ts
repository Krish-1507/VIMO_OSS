import { ConnectorPack } from '../types';

export const notionPack: ConnectorPack = {
  id: 'notion',
  name: 'Notion',
  icon: 'FileText',
  brandColor: 'from-gray-800 to-gray-900',
  description: 'Give VIMO context from your company docs and notes.',
  longDescription: 'Connect Notion so VIMO can read your documentation, meeting notes, and product specs to create better content and campaigns.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'knowledge_packs',
  provider: 'notion',
  connectionType: 'oauth',
  requirements: [
    { id: 'notion_account', label: 'I have a Notion account', checked: false },
    { id: 'pages', label: 'I have pages I want VIMO to reference', checked: false },
  ],
  capabilities: [
    { icon: 'FileText', label: 'Read pages' },
    { icon: 'BookOpen', label: 'Access documentation' },
    { icon: 'ClipboardList', label: 'Review meeting notes' },
    { icon: 'Brain', label: 'Understand your business' },
  ],
  whatVimoLearns: [
    { icon: 'FileText', label: 'Pages & Docs' },
    { icon: 'BookOpen', label: 'Product Documentation' },
    { icon: 'ClipboardList', label: 'Meeting Notes' },
    { icon: 'Lightbulb', label: 'Company Knowledge' },
  ],
  whatVimoGenerates: [
    { icon: 'Lightbulb', label: 'Content Ideas' },
    { icon: 'FileText', label: 'Thought Leadership' },
    { icon: 'Megaphone', label: 'Social Content from Docs' },
    { icon: 'BarChart3', label: 'Campaign Strategies' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Notion',
      description: 'Give VIMO access to your Notion workspace so it can reference your documentation, notes, and company knowledge.',
      requirements: [
        { id: 'notion_account', label: 'I have a Notion account', checked: false },
        { id: 'pages', label: 'I have pages I want VIMO to reference', checked: false },
      ],
    },
    {
      id: 'authorize',
      type: 'oauth_connect',
      title: 'Authorize VIMO',
      description: 'Click below to authorize VIMO to access your Notion workspace. A secure popup will open.',
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Content',
      description: 'VIMO is scanning your Notion workspace...',
      discoveryItems: [
        { icon: 'FileText', label: 'Pages found', value: '37' },
        { icon: 'BookOpen', label: 'Product docs', value: '6' },
        { icon: 'ClipboardList', label: 'Meeting notes', value: '12' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_notion',
      question: 'What will VIMO do with my Notion content?',
      answer: 'VIMO reads your pages to understand your business, products, and strategy. This helps it create more relevant content and campaigns.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Notion connected. We found:',
    items: [
      { icon: 'FileText', label: 'Pages', value: '37' },
      { icon: 'BookOpen', label: 'Product docs', value: '6' },
      { icon: 'ClipboardList', label: 'Meeting notes', value: '12' },
    ],
  },
  successActions: [
    { label: 'Generate content ideas from docs', cta: 'Get Ideas', route: '/content' },
    { label: 'Create thought leadership posts', cta: 'Create Posts', route: '/content' },
    { label: 'Turn docs into social content', cta: 'Repurpose', route: '/content' },
  ],
  exampleOutputs: [
    'LinkedIn thought leadership posts from your documentation',
    'Twitter threads summarizing key product decisions',
    'Blog post outlines based on meeting notes',
    'Campaign ideas grounded in your strategy docs',
  ],
};
