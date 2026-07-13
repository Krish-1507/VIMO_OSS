import { ConnectorPack } from '../types';

export const linearPack: ConnectorPack = {
  id: 'linear',
  name: 'Linear',
  icon: 'Kanban',
  brandColor: 'from-indigo-500 to-indigo-700',
  description: 'Give VIMO context from your product roadmap.',
  longDescription: 'Connect Linear so VIMO can track your product development, sprints, and feature releases to generate launch content and updates.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'knowledge_packs',
  provider: 'linear',
  connectionType: 'oauth',
  requirements: [
    { id: 'linear_account', label: 'I have a Linear account', checked: false },
    { id: 'team', label: 'I have projects I want VIMO to track', checked: false },
  ],
  capabilities: [
    { icon: 'Kanban', label: 'Read projects' },
    { icon: 'ListChecks', label: 'Track sprints' },
    { icon: 'Tag', label: 'Monitor cycles' },
    { icon: 'TrendingUp', label: 'Follow roadmap progress' },
  ],
  whatVimoLearns: [
    { icon: 'Kanban', label: 'Projects & Roadmap' },
    { icon: 'ListChecks', label: 'Sprints & Cycles' },
    { icon: 'Tag', label: 'Feature Releases' },
    { icon: 'TrendingUp', label: 'Team Velocity' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Launch Announcements' },
    { icon: 'FileText', label: 'Sprint Updates' },
    { icon: 'RefreshCw', label: 'Weekly Progress' },
    { icon: 'Speaker', label: 'Feature Highlights' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Linear',
      description: 'Give VIMO access to your Linear workspace so it can create content about your product development.',
      requirements: [
        { id: 'linear_account', label: 'I have a Linear account', checked: false },
        { id: 'team', label: 'I have projects I want VIMO to track', checked: false },
      ],
    },
    {
      id: 'instructions',
      type: 'instructions',
      title: 'Get Your Linear API Key',
      description: 'Follow these steps to create an API key for Linear.',
      instructionBullets: [
        'Open Linear and go to Settings → API',
        'Click "Create key" and give it a name (e.g., "VIMO")',
        'Copy the generated API key',
        'Paste it below so VIMO can track your projects and roadmap',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Linear API Key',
      description: 'Paste your Linear API key below.',
      credentialFields: [
        { key: 'apiKey', label: 'API Key', placeholder: 'lin_api_...', isSecret: true, helpText: 'The API key from Linear Settings → API' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Projects',
      description: 'VIMO is scanning your Linear workspace...',
      discoveryItems: [
        { icon: 'Kanban', label: 'Projects found', value: '8' },
        { icon: 'ListChecks', label: 'Active sprints', value: '3' },
        { icon: 'Tag', label: 'Recent releases', value: '5' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_linear',
      question: 'What will VIMO do with my Linear data?',
      answer: 'VIMO reads your projects, sprints, and cycles to create content about your product development. It never modifies your tickets or projects.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Linear connected. We found:',
    items: [
      { icon: 'Kanban', label: 'Projects', value: '8' },
      { icon: 'ListChecks', label: 'Active sprints', value: '3' },
      { icon: 'Tag', label: 'Recent releases', value: '5' },
    ],
  },
  successActions: [
    { label: 'Create sprint update post', cta: 'Write Update', route: '/content' },
    { label: 'Announce new features', cta: 'Create Post', route: '/content' },
    { label: 'Generate weekly progress report', cta: 'Generate', route: '/content' },
  ],
  exampleOutputs: [
    'Sprint review posts for your community',
    'Feature launch announcements',
    'Weekly product development updates',
    'Roadmap progress summaries',
  ],
};
