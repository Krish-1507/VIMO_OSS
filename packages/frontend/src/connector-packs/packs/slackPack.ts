import { ConnectorPack } from '../types';

export const slackPack: ConnectorPack = {
  id: 'slack',
  name: 'Slack',
  icon: 'MessageSquare',
  brandColor: 'from-purple-500 to-purple-700',
  description: 'Give VIMO context from your team conversations.',
  longDescription: 'Connect Slack so VIMO can understand your team discussions, customer feedback, and internal knowledge to create better content.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'knowledge_packs',
  provider: 'slack',
  connectionType: 'api_key',
  requirements: [
    { id: 'slack_workspace', label: 'I have a Slack workspace', checked: false },
  ],
  capabilities: [
    { icon: 'MessageSquare', label: 'Read channels' },
    { icon: 'MessageCircle', label: 'Monitor discussions' },
    { icon: 'Users', label: 'Understand team knowledge' },
    { icon: 'Lightbulb', label: 'Surface insights' },
  ],
  whatVimoLearns: [
    { icon: 'MessageSquare', label: 'Team Discussions' },
    { icon: 'MessageCircle', label: 'Customer Feedback' },
    { icon: 'Users', label: 'Internal Knowledge' },
    { icon: 'TrendingUp', label: 'Team Priorities' },
  ],
  whatVimoGenerates: [
    { icon: 'FileText', label: 'Content from Discussions' },
    { icon: 'Megaphone', label: 'Announcements' },
    { icon: 'BarChart3', label: 'Team Updates' },
    { icon: 'Lightbulb', label: 'Content Ideas' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Slack',
      description: 'Give VIMO access to your Slack workspace so it can learn from your team conversations.',
      requirements: [
        { id: 'slack_workspace', label: 'I have a Slack workspace', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Create a Slack App & Get Your Token',
      description: 'Follow these steps to create a Slack app and get a bot token.',
      instructionBullets: [
        'Go to api.slack.com/apps and click "Create New App" → "From scratch"',
        'Name it "VIMO" and select your workspace',
        'Go to "Bot Scopes" and add the permission scopes you need',
        'Go to "Permissions" and click "Install to Workspace"',
        'Copy the "Bot User Token" that starts with xoxb-',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Slack Bot Token',
      description: 'Paste your Slack Bot User Token below.',
      credentialFields: [
        { key: 'accessToken', label: 'Bot Token', placeholder: 'xoxb-...', isSecret: true, helpText: 'The Bot User Token from your Slack app dashboard' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Channels',
      description: 'VIMO is scanning your Slack workspace...',
      discoveryItems: [
        { icon: 'MessageSquare', label: 'Channels found', value: '15' },
        { icon: 'Users', label: 'Team members', value: '24' },
        { icon: 'MessageCircle', label: 'Recent discussions', value: '89' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_slack',
      question: 'What will VIMO do with my Slack data?',
      answer: 'VIMO reads public channels to understand your team discussions, customer feedback, and product conversations. It uses this to create more relevant content.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Slack connected. We found:',
    items: [
      { icon: 'MessageSquare', label: 'Channels', value: '15' },
      { icon: 'Users', label: 'Team members', value: '24' },
      { icon: 'MessageCircle', label: 'Recent discussions', value: '89' },
    ],
  },
  successActions: [
    { label: 'Create content from team discussions', cta: 'Create Content', route: '/content' },
    { label: 'Turn feedback into social posts', cta: 'Repurpose', route: '/content' },
    { label: 'Generate weekly team updates', cta: 'Write Update', route: '/content' },
  ],
  exampleOutputs: [
    'Social posts based on customer feedback from Slack',
    'Internal announcements repurposed for LinkedIn',
    'Product updates derived from team discussions',
    'Weekly roundups of team achievements',
  ],
};
