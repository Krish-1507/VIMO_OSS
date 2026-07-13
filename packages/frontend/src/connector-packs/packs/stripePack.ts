import { ConnectorPack } from '../types';

export const stripePack: ConnectorPack = {
  id: 'stripe',
  name: 'Stripe',
  icon: 'CreditCard',
  brandColor: 'from-indigo-500 to-purple-600',
  description: 'Create content from your payment data.',
  longDescription: 'Connect Stripe so VIMO can understand your sales trends, customer behavior, and revenue patterns to create data-driven content.',
  difficulty: 'Medium',
  estimatedSetupTime: '3 minutes',
  category: 'creative_commerce',
  provider: 'stripe',
  connectionType: 'api_key',
  requirements: [
    { id: 'stripe_account', label: 'I have a Stripe account', checked: false },
  ],
  capabilities: [
    { icon: 'CreditCard', label: 'Read transactions' },
    { icon: 'BarChart3', label: 'Track revenue' },
    { icon: 'TrendingUp', label: 'Monitor trends' },
    { icon: 'Users', label: 'Understand customers' },
  ],
  whatVimoLearns: [
    { icon: 'CreditCard', label: 'Sales Data' },
    { icon: 'BarChart3', label: 'Revenue Trends' },
    { icon: 'TrendingUp', label: 'Growth Patterns' },
    { icon: 'Users', label: 'Customer Behavior' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Revenue Announcements' },
    { icon: 'BarChart3', label: 'Growth Reports' },
    { icon: 'FileText', label: 'Data-driven Stories' },
    { icon: 'Calendar', label: 'Seasonal Insights' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Stripe',
      description: 'Give VIMO access to your Stripe data so it can create content from your sales trends and customer insights.',
      requirements: [
        { id: 'stripe_account', label: 'I have a Stripe account', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Get Your Stripe API Key',
      description: 'Follow these steps to generate a restricted API key in Stripe.',
      instructionBullets: [
        'Go to dashboard.stripe.com/apikeys and log in',
        'Click "Create restricted key"',
        'Select read-only permissions for the data VIMO needs to access',
        'Copy the generated key (it starts with rk_live_ or sk_live_)',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Stripe API Key',
      description: 'Paste your Stripe restricted API key below.',
      credentialFields: [
        { key: 'apiKey', label: 'API Key', placeholder: 'rk_live_... or sk_live_...', isSecret: true, helpText: 'The restricted API key from your Stripe dashboard' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Analyzing Your Sales Data',
      description: 'VIMO is analyzing your Stripe data...',
      discoveryItems: [
        { icon: 'CreditCard', label: 'Monthly transactions', value: '1,240' },
        { icon: 'BarChart3', label: 'Revenue trend', value: 'Growing' },
        { icon: 'TrendingUp', label: 'Top product', value: 'Detected' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_stripe',
      question: 'What will VIMO do with my Stripe data?',
      answer: 'VIMO reads your transaction data to create data-driven content like growth reports, revenue announcements, and customer insights.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Stripe connected. VIMO is analyzing:',
    items: [
      { icon: 'CreditCard', label: 'Monthly transactions', value: '1,240' },
      { icon: 'BarChart3', label: 'Revenue trend', value: 'Growing' },
      { icon: 'TrendingUp', label: 'Growth rate', value: '+12%' },
    ],
  },
  successActions: [
    { label: 'Create revenue milestone post', cta: 'Create Post', route: '/content' },
    { label: 'Generate growth report', cta: 'Generate Report', route: '/content' },
    { label: 'Create data-driven campaign', cta: 'Build Campaign', route: '/campaigns' },
  ],
  exampleOutputs: [
    'Revenue milestone announcements',
    'Monthly growth reports for social media',
    'Customer behavior insights and trends',
    'Data-driven storytelling content',
  ],
};
