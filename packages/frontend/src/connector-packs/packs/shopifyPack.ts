import { ConnectorPack } from '../types';

export const shopifyPack: ConnectorPack = {
  id: 'shopify',
  name: 'Shopify',
  icon: 'ShoppingBag',
  brandColor: 'from-green-500 to-green-700',
  description: 'Turn your products into marketing content.',
  longDescription: 'Connect Shopify so VIMO can access your products, collections, and inventory to create promotional content and campaigns.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'creative_commerce',
  provider: 'shopify',
  connectionType: 'api_key',
  isPopular: true,
  requirements: [
    { id: 'shopify_store', label: 'I have a Shopify store', checked: false },
  ],
  capabilities: [
    { icon: 'ShoppingBag', label: 'Read products' },
    { icon: 'Layers', label: 'Access collections' },
    { icon: 'BarChart3', label: 'Track best sellers' },
    { icon: 'TrendingUp', label: 'Monitor inventory' },
  ],
  whatVimoLearns: [
    { icon: 'ShoppingBag', label: 'Products & Inventory' },
    { icon: 'Layers', label: 'Collections' },
    { icon: 'BarChart3', label: 'Best Sellers' },
    { icon: 'TrendingUp', label: 'Sales Trends' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Product Launch Posts' },
    { icon: 'DollarSign', label: 'Promotional Campaigns' },
    { icon: 'ShoppingBag', label: 'Product Content' },
    { icon: 'Calendar', label: 'Seasonal Promotions' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect Shopify',
      description: 'Give VIMO access to your Shopify store so it can create product content and campaigns.',
      requirements: [
        { id: 'shopify_store', label: 'I have a Shopify store', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Get Your Shopify API Credentials',
      description: 'Follow these steps to create an API key in your Shopify admin.',
      instructionBullets: [
        'Go to your Shopify admin → Settings → Apps and sales channels → Develop apps',
        'Click "Create an app" and give it a name (e.g., "VIMO")',
        'Go to the "Configuration" tab and add the Admin API scopes you want to grant',
        'Go to the "API credentials" tab and click "Install app"',
        'Copy the Admin API access token and your store domain',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Shopify Credentials',
      description: 'Paste your Shopify Admin API token and store domain below.',
      credentialFields: [
        { key: 'shopDomain', label: 'Shop Domain', placeholder: 'your-store.myshopify.com', isSecret: false, helpText: 'Your Shopify store URL (e.g., my-store.myshopify.com)' },
        { key: 'apiKey', label: 'Admin API Token', placeholder: 'shpat_...', isSecret: true, helpText: 'The API token you generated from Shopify admin' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Products',
      description: 'VIMO is scanning your Shopify store...',
      discoveryItems: [
        { icon: 'ShoppingBag', label: 'Products found', value: '48' },
        { icon: 'Layers', label: 'Collections', value: '6' },
        { icon: 'BarChart3', label: 'Best sellers', value: '12' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_shopify',
      question: 'What will VIMO do with my Shopify data?',
      answer: 'VIMO reads your products, collections, and inventory to create promotional content, launch campaigns, and seasonal promotions.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Shopify connected. We found:',
    items: [
      { icon: 'ShoppingBag', label: 'Products', value: '48' },
      { icon: 'Layers', label: 'Collections', value: '6' },
      { icon: 'BarChart3', label: 'Best sellers', value: '12' },
    ],
  },
  successActions: [
    { label: 'Create product launch campaign', cta: 'Launch Campaign', route: '/campaigns' },
    { label: 'Promote best-selling products', cta: 'Promote Now', route: '/content' },
    { label: 'Generate seasonal promotions', cta: 'Create Promos', route: '/content' },
  ],
  exampleOutputs: [
    'Product launch posts for new arrivals',
    'Best seller promotional campaigns',
    'Seasonal promotion content (holidays, sales)',
    'Product spotlight social posts with buy links',
  ],
};
