import { ConnectorPack } from '../types';

export const hubspotPack: ConnectorPack = {
  id: 'hubspot',
  name: 'HubSpot',
  icon: 'CircleDot',
  brandColor: 'from-orange-500 to-orange-700',
  description: 'Give VIMO context from your CRM and marketing data.',
  longDescription: 'Connect HubSpot so VIMO can understand your customers, deals, and marketing performance to create targeted content.',
  difficulty: 'Medium',
  estimatedSetupTime: '3 minutes',
  category: 'knowledge_packs',
  provider: 'hubspot',
  connectionType: 'api_key',
  requirements: [
    { id: 'hubspot_account', label: 'I have a HubSpot account', checked: false },
  ],
  capabilities: [
    { icon: 'Users', label: 'Read contacts' },
    { icon: 'DollarSign', label: 'Track deals' },
    { icon: 'BarChart3', label: 'View marketing analytics' },
    { icon: 'Target', label: 'Understand customers' },
  ],
  whatVimoLearns: [
    { icon: 'Users', label: 'Customer Segments' },
    { icon: 'DollarSign', label: 'Sales Trends' },
    { icon: 'BarChart3', label: 'Marketing Performance' },
    { icon: 'Target', label: 'Customer Needs' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Targeted Campaigns' },
    { icon: 'FileText', label: 'Customer Stories' },
    { icon: 'Mail', label: 'Email Content' },
    { icon: 'BarChart3', label: 'Performance Reports' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect HubSpot',
      description: 'Give VIMO access to your HubSpot data so it can create targeted marketing content.',
      requirements: [
        { id: 'hubspot_account', label: 'I have a HubSpot account', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Create a HubSpot Private App',
      description: 'Follow these steps to create a private app in HubSpot.',
      instructionBullets: [
        'Go to your HubSpot account → Settings → Integrations → Private Apps',
        'Click "Create private app" and name it "VIMO"',
        'Add the scopes you want to grant (read access to contacts, deals, analytics)',
        'Click "Create" and copy the access token that appears',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your HubSpot Token',
      description: 'Paste your HubSpot Private App access token below.',
      credentialFields: [
        { key: 'accessToken', label: 'Private App Token', placeholder: 'Paste your HubSpot private app token', isSecret: true, helpText: 'The access token from your HubSpot private app' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your HubSpot Data',
      description: 'VIMO is analyzing your HubSpot account...',
      discoveryItems: [
        { icon: 'Users', label: 'Contacts', value: '2,450' },
        { icon: 'DollarSign', label: 'Active deals', value: '18' },
        { icon: 'BarChart3', label: 'Campaigns running', value: '4' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_hubspot',
      question: 'What will VIMO do with my HubSpot data?',
      answer: 'VIMO reads your contacts, deals, and marketing data to create targeted content and campaigns. It never modifies your CRM data.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'HubSpot connected. We found:',
    items: [
      { icon: 'Users', label: 'Contacts', value: '2,450' },
      { icon: 'DollarSign', label: 'Active deals', value: '18' },
      { icon: 'BarChart3', label: 'Campaigns running', value: '4' },
    ],
  },
  successActions: [
    { label: 'Create targeted email campaign', cta: 'Create Campaign', route: '/campaigns' },
    { label: 'Generate customer success stories', cta: 'Write Stories', route: '/content' },
    { label: 'Build lead nurturing content', cta: 'Build Content', route: '/content' },
  ],
  exampleOutputs: [
    'Targeted email campaigns based on contact segments',
    'Customer success stories from closed deals',
    'Content tailored to specific buyer personas',
    'Marketing performance reports with recommendations',
  ],
};
