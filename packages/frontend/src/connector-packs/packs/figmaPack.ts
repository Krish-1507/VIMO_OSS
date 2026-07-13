import { ConnectorPack } from '../types';

export const figmaPack: ConnectorPack = {
  id: 'figma',
  name: 'Figma',
  icon: 'PenTool',
  brandColor: 'from-amber-500 to-orange-500',
  description: 'Access your design system and export assets.',
  longDescription: 'Connect Figma so VIMO can access your design files, components, and brand assets to create consistent marketing content.',
  difficulty: 'Medium',
  estimatedSetupTime: '3 minutes',
  category: 'creative_commerce',
  provider: 'figma',
  connectionType: 'oauth',
  requirements: [
    { id: 'figma_account', label: 'I have a Figma account', checked: false },
    { id: 'files', label: 'I have design files VIMO can use', checked: false },
  ],
  capabilities: [
    { icon: 'PenTool', label: 'Read design files' },
    { icon: 'Layers', label: 'Access components' },
    { icon: 'Image', label: 'Export assets' },
    { icon: 'Palette', label: 'Use brand styles' },
  ],
  whatVimoLearns: [
    { icon: 'PenTool', label: 'Design Files' },
    { icon: 'Layers', label: 'Components' },
    { icon: 'Palette', label: 'Brand Styles' },
    { icon: 'Image', label: 'Design Assets' },
  ],
  whatVimoGenerates: [
    { icon: 'Image', label: 'Social Graphics' },
    { icon: 'Megaphone', label: 'Campaign Assets' },
    { icon: 'Layers', label: 'Content Templates' },
    { icon: 'PenTool', label: 'Brand Collateral' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Figma',
      description: 'Give VIMO access to your Figma design files so it can create consistent, on-brand marketing content.',
      requirements: [
        { id: 'figma_account', label: 'I have a Figma account', checked: false },
        { id: 'files', label: 'I have design files VIMO can use', checked: false },
      ],
    },
    {
      id: 'instructions',
      type: 'instructions',
      title: 'Get Your Figma Access Token',
      description: 'Follow these steps to create a Personal Access Token in Figma.',
      instructionBullets: [
        'Open Figma and go to Settings → Account → Personal Access Tokens',
        'Click "Create new token" and give it a name (e.g., "VIMO")',
        'Copy the generated token (it starts with "figd_")',
        'Paste it below so VIMO can access your design files',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Figma Token',
      description: 'Paste your Figma Personal Access Token below.',
      credentialFields: [
        { key: 'accessToken', label: 'Personal Access Token', placeholder: 'figd_...', isSecret: true, helpText: 'The token you generated from Figma Settings → Personal Access Tokens' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Design Files',
      description: 'VIMO is scanning your Figma workspace...',
      discoveryItems: [
        { icon: 'PenTool', label: 'Design files found', value: '18' },
        { icon: 'Layers', label: 'Components detected', value: '45' },
        { icon: 'Palette', label: 'Brand styles', value: '3' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_figma',
      question: 'What will VIMO do with my Figma designs?',
      answer: 'VIMO reads your design files to understand your brand styles, export assets for social content, and create consistent marketing materials.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Figma connected. We found:',
    items: [
      { icon: 'PenTool', label: 'Design files', value: '18' },
      { icon: 'Layers', label: 'Components', value: '45' },
      { icon: 'Palette', label: 'Brand styles', value: '3' },
    ],
  },
  successActions: [
    { label: 'Export assets for social', cta: 'Export Assets', route: '/content' },
    { label: 'Create campaign creative', cta: 'Design Campaign', route: '/content' },
    { label: 'Build content templates', cta: 'Build Templates', route: '/content' },
  ],
  exampleOutputs: [
    'Social media graphics using your design system',
    'Campaign assets aligned with brand styles',
    'Auto-resized content for multiple platforms',
    'Brand-consistent collateral from design components',
  ],
};
