import { ConnectorPack } from '../types';

export const githubPack: ConnectorPack = {
  id: 'github',
  name: 'GitHub',
  icon: 'Github',
  brandColor: 'from-gray-800 to-gray-900',
  description: 'Give VIMO context about your product development.',
  longDescription: 'Connect your GitHub repositories so VIMO can track releases, monitor commits, and generate launch content, changelogs, and product announcements.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'knowledge_packs',
  provider: 'github',
  connectionType: 'oauth',
  isPopular: true,
  requirements: [
    { id: 'github_account', label: 'I have a GitHub account', checked: false },
    { id: 'repos', label: 'I have repositories I want VIMO to track', checked: false },
  ],
  capabilities: [
    { icon: 'FileText', label: 'Read repositories' },
    { icon: 'GitCommit', label: 'Track commits' },
    { icon: 'Tag', label: 'Monitor releases' },
    { icon: 'BarChart3', label: 'Track product progress' },
  ],
  whatVimoLearns: [
    { icon: 'BookOpen', label: 'Repositories' },
    { icon: 'Tag', label: 'Releases' },
    { icon: 'GitCommit', label: 'Commits' },
    { icon: 'TrendingUp', label: 'Product Progress' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Launch Posts' },
    { icon: 'FileText', label: 'Changelogs' },
    { icon: 'RefreshCw', label: 'Weekly Updates' },
    { icon: 'Speaker', label: 'Product Announcements' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect GitHub',
      description: 'Give VIMO access to your repositories so it can create content about your product development.',
      requirements: [
        { id: 'github_account', label: 'I have a GitHub account', checked: false },
        { id: 'repos', label: 'I have repositories I want VIMO to track', checked: false },
      ],
    },
    {
      id: 'authorize',
      type: 'oauth_connect',
      title: 'Authorize VIMO',
      description: 'Click below to authorize VIMO to access your GitHub repositories. A secure popup will open.',
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Repositories',
      description: 'VIMO is scanning your GitHub account...',
      discoveryItems: [
        { icon: 'BookOpen', label: 'Repositories found', value: '12' },
        { icon: 'Tag', label: 'Releases this month', value: '4' },
        { icon: 'GitCommit', label: 'Commits this week', value: '58' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_github',
      question: 'What will VIMO do with my GitHub data?',
      answer: 'VIMO reads your repositories, releases, and commits to create content like launch posts, changelogs, and product updates. It never modifies your code.',
    },
    {
      id: 'permissions',
      question: 'What permissions does VIMO need?',
      answer: 'VIMO needs read-only access to your repositories. It never writes to your code or makes changes.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'GitHub connected. We found:',
    items: [
      { icon: 'BookOpen', label: 'Repositories', value: '12' },
      { icon: 'Tag', label: 'Releases this month', value: '4' },
      { icon: 'GitCommit', label: 'Commits this week', value: '58' },
    ],
  },
  successActions: [
    { label: 'Generate launch content', cta: 'Create Launch Post', route: '/content' },
    { label: 'Create changelog', cta: 'Write Changelog', route: '/content' },
    { label: 'Build release campaign', cta: 'Start Campaign', route: '/campaigns' },
  ],
  exampleOutputs: [
    'Product launch post announcing new features',
    'Weekly development update for your community',
    'Release notes formatted for social media',
    'Changelog summaries for your audience',
  ],
};
