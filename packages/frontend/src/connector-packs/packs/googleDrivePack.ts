import { ConnectorPack } from '../types';

export const googleDrivePack: ConnectorPack = {
  id: 'google-drive',
  name: 'Google Drive',
  icon: 'Files',
  brandColor: 'from-blue-400 to-blue-600',
  description: 'Give VIMO access to your documents and assets.',
  longDescription: 'Connect Google Drive so VIMO can read your documents, presentations, and spreadsheets to create better content and campaigns.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'knowledge_packs',
  provider: 'google-drive',
  connectionType: 'oauth',
  requirements: [
    { id: 'google_account', label: 'I have a Google account', checked: false },
  ],
  capabilities: [
    { icon: 'FileText', label: 'Read documents' },
    { icon: 'Image', label: 'Access presentations' },
    { icon: 'Table', label: 'Review spreadsheets' },
    { icon: 'FolderOpen', label: 'Browse your files' },
  ],
  whatVimoLearns: [
    { icon: 'FileText', label: 'Documents' },
    { icon: 'Image', label: 'Presentations' },
    { icon: 'Table', label: 'Spreadsheets' },
    { icon: 'FolderOpen', label: 'Company Assets' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Content from Docs' },
    { icon: 'FileText', label: 'Summaries' },
    { icon: 'BarChart3', label: 'Data-driven Posts' },
    { icon: 'Lightbulb', label: 'Campaign Ideas' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Google Drive',
      description: 'Give VIMO access to your Google Drive so it can reference your documents and assets.',
      requirements: [
        { id: 'google_account', label: 'I have a Google account', checked: false },
      ],
    },
    {
      id: 'authorize',
      type: 'oauth_connect',
      title: 'Authorize VIMO',
      description: 'Click below to authorize VIMO to access your Google Drive. A secure popup will open.',
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Files',
      description: 'VIMO is scanning your Google Drive...',
      discoveryItems: [
        { icon: 'FileText', label: 'Documents found', value: '45' },
        { icon: 'Image', label: 'Presentations', value: '8' },
        { icon: 'Table', label: 'Spreadsheets', value: '12' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_drive',
      question: 'What will VIMO do with my Drive files?',
      answer: 'VIMO reads your documents to understand your business strategy, products, and plans. It never modifies or deletes your files.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Google Drive connected. We found:',
    items: [
      { icon: 'FileText', label: 'Documents', value: '45' },
      { icon: 'Image', label: 'Presentations', value: '8' },
      { icon: 'Table', label: 'Spreadsheets', value: '12' },
    ],
  },
  successActions: [
    { label: 'Turn docs into social content', cta: 'Create Posts', route: '/content' },
    { label: 'Summarize key documents', cta: 'Summarize', route: '/content' },
    { label: 'Create data-driven posts from spreadsheets', cta: 'Generate', route: '/content' },
  ],
  exampleOutputs: [
    'Social posts based on your strategy documents',
    'LinkedIn articles summarizing key presentations',
    'Data-driven infographics from spreadsheets',
    'Campaign concepts grounded in your business plans',
  ],
};
