import { ConnectorPack } from '../types';

export const adobeExpressPack: ConnectorPack = {
  id: 'adobe-express',
  name: 'Adobe Express',
  icon: 'PenTool',
  brandColor: 'from-red-500 to-pink-600',
  description: 'Create on-brand social graphics and marketing assets.',
  longDescription: 'Connect Adobe Express so VIMO can create social graphics, access your brand kits, and generate campaign creative automatically.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'creative_commerce',
  provider: 'adobe-express',
  connectionType: 'oauth',
  requirements: [
    { id: 'adobe_account', label: 'I have an Adobe account', checked: false },
  ],
  capabilities: [
    { icon: 'PenTool', label: 'Design graphics' },
    { icon: 'Palette', label: 'Use brand kits' },
    { icon: 'Image', label: 'Access templates' },
    { icon: 'Zap', label: 'Generate creative' },
  ],
  whatVimoLearns: [
    { icon: 'Palette', label: 'Brand Kits' },
    { icon: 'Image', label: 'Templates' },
    { icon: 'PenTool', label: 'Recent Designs' },
    { icon: 'Layers', label: 'Brand Assets' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Campaign Creative' },
    { icon: 'Image', label: 'Social Graphics' },
    { icon: 'Layers', label: 'Marketing Assets' },
    { icon: 'Palette', label: 'Brand Content' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Adobe Express',
      description: 'Give VIMO access to your Adobe Express account so it can create on-brand graphics and access your templates.',
      requirements: [
        { id: 'adobe_account', label: 'I have an Adobe account', checked: false },
      ],
    },
    {
      id: 'instructions',
      type: 'instructions',
      title: 'Get Your Adobe Access Token',
      description: 'Follow these steps to create an API key for Adobe Express.',
      instructionBullets: [
        'Go to developer.adobe.com/console and create a new project',
        'Add the "Adobe Express Embed" API to your project',
        'Click "Generate Access Token" and copy the token',
        'Paste it below so VIMO can access your brand assets',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Adobe Access Token',
      description: 'Paste the access token from your Adobe Developer project.',
      credentialFields: [
        { key: 'accessToken', label: 'Access Token', placeholder: 'Paste your Adobe access token', isSecret: true, helpText: 'The access token from your Adobe Developer Console project' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Brand Assets',
      description: 'VIMO is scanning your Adobe Express account...',
      discoveryItems: [
        { icon: 'Palette', label: 'Brand kits found', value: '2' },
        { icon: 'Image', label: 'Templates available', value: '15' },
        { icon: 'PenTool', label: 'Recent designs', value: '6' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_adobe',
      question: 'What will VIMO do with my Adobe Express assets?',
      answer: 'VIMO uses your brand kits and templates to create on-brand social graphics and marketing assets. It never modifies your existing designs.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Adobe Express connected. We found:',
    items: [
      { icon: 'Palette', label: 'Brand kits', value: '2' },
      { icon: 'Image', label: 'Templates', value: '15' },
      { icon: 'PenTool', label: 'Recent designs', value: '6' },
    ],
  },
  successActions: [
    { label: 'Generate campaign creative', cta: 'Design Now', route: '/content' },
    { label: 'Create social media graphics', cta: 'Create Graphics', route: '/content' },
    { label: 'Build marketing asset package', cta: 'Build Package', route: '/content' },
  ],
  exampleOutputs: [
    'On-brand social graphics for all platforms',
    'Campaign creative packages with multiple formats',
    'Auto-branded content using your brand kits',
    'Marketing asset templates for consistent branding',
  ],
};
