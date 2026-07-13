import { ConnectorPack } from '../types';

export const canvaPack: ConnectorPack = {
  id: 'canva',
  name: 'Canva',
  icon: 'PenTool',
  brandColor: 'from-teal-400 to-cyan-600',
  description: 'Design social graphics and brand assets.',
  longDescription: 'Connect Canva so VIMO can create on-brand social graphics, access your templates, and generate campaign creative automatically.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'creative_commerce',
  provider: 'canva',
  connectionType: 'oauth',
  isPopular: true,
  requirements: [
    { id: 'canva_account', label: 'I have a Canva account', checked: false },
  ],
  capabilities: [
    { icon: 'PenTool', label: 'Design graphics' },
    { icon: 'Image', label: 'Access templates' },
    { icon: 'Layers', label: 'Use brand assets' },
    { icon: 'Zap', label: 'Generate creative' },
  ],
  whatVimoLearns: [
    { icon: 'Image', label: 'Brand Assets' },
    { icon: 'Layers', label: 'Templates' },
    { icon: 'PenTool', label: 'Recent Designs' },
    { icon: 'Palette', label: 'Brand Style' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Campaign Creative' },
    { icon: 'Image', label: 'Social Assets' },
    { icon: 'Layers', label: 'Content Packages' },
    { icon: 'PenTool', label: 'Brand Graphics' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Canva',
      description: 'Give VIMO access to your Canva account so it can create on-brand graphics and access your templates.',
      requirements: [
        { id: 'canva_account', label: 'I have a Canva account', checked: false },
      ],
    },
    {
      id: 'authorize',
      type: 'oauth_connect',
      title: 'Authorize VIMO',
      description: 'Click below to authorize VIMO to access your Canva designs. A secure popup will open.',
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Canva Assets',
      description: 'VIMO is scanning your Canva account for brand assets and templates...',
      discoveryItems: [
        { icon: 'Image', label: 'Brand assets found', value: '24' },
        { icon: 'Layers', label: 'Templates available', value: '12' },
        { icon: 'PenTool', label: 'Recent designs', value: '8' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_canva',
      question: 'What will VIMO do with my Canva assets?',
      answer: 'VIMO uses your brand assets and templates to create on-brand social graphics. It never modifies your existing designs without your permission.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Canva connected. We found:',
    items: [
      { icon: 'Image', label: 'Brand assets', value: '24' },
      { icon: 'Layers', label: 'Templates', value: '12' },
      { icon: 'PenTool', label: 'Recent designs', value: '8' },
    ],
  },
  successActions: [
    { label: 'Generate campaign creative', cta: 'Design Now', route: '/content' },
    { label: 'Create social media assets', cta: 'Create Assets', route: '/content' },
    { label: 'Build content package', cta: 'Build Package', route: '/content' },
  ],
  exampleOutputs: [
    'On-brand social graphics for each platform',
    'Campaign creative packages with multiple formats',
    'Auto-sized designs for Instagram, LinkedIn, Twitter',
    'Brand-consistent content templates',
  ],
};
