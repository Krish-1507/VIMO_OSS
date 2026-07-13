import { ConnectorPack } from '../types';

export const woocommercePack: ConnectorPack = {
  id: 'woocommerce',
  name: 'WooCommerce',
  icon: 'ShoppingCart',
  brandColor: 'from-purple-500 to-indigo-600',
  description: 'Turn your WooCommerce data into marketing content.',
  longDescription: 'Connect WooCommerce so VIMO can access your products, orders, and inventory to create promotional content and campaigns.',
  difficulty: 'Medium',
  estimatedSetupTime: '3 minutes',
  category: 'creative_commerce',
  provider: 'woocommerce',
  connectionType: 'api_key',
  requirements: [
    { id: 'woocommerce_store', label: 'I have a WooCommerce store', checked: false },
  ],
  capabilities: [
    { icon: 'ShoppingCart', label: 'Read products' },
    { icon: 'Package', label: 'Track inventory' },
    { icon: 'BarChart3', label: 'Monitor orders' },
    { icon: 'TrendingUp', label: 'Spot trends' },
  ],
  whatVimoLearns: [
    { icon: 'ShoppingCart', label: 'Products & Inventory' },
    { icon: 'Package', label: 'Order Trends' },
    { icon: 'BarChart3', label: 'Sales Performance' },
    { icon: 'TrendingUp', label: 'Customer Preferences' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Product Announcements' },
    { icon: 'DollarSign', label: 'Sales Campaigns' },
    { icon: 'ShoppingCart', label: 'Promotional Posts' },
    { icon: 'Calendar', label: 'Seasonal Content' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Connect WooCommerce',
      description: 'Give VIMO access to your WooCommerce store so it can create product content and campaigns.',
      requirements: [
        { id: 'woocommerce_store', label: 'I have a WooCommerce store', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Get Your WooCommerce API Keys',
      description: 'Follow these steps to generate API keys in WooCommerce.',
      instructionBullets: [
        'Go to your WordPress admin → WooCommerce → Settings → Advanced → REST API',
        'Click "Add Key" and create a description (e.g., "VIMO")',
        'Select "Read/Write" permissions and click "Generate Key"',
        'Copy the Consumer Key and Consumer Secret that appear',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your WooCommerce Credentials',
      description: 'Paste your WooCommerce Consumer Key, Consumer Secret, and store URL below.',
      credentialFields: [
        { key: 'storeUrl', label: 'Store URL', placeholder: 'https://your-store.com', isSecret: false, helpText: 'Your WooCommerce store URL (e.g., https://mystore.com)' },
        { key: 'consumerKey', label: 'Consumer Key', placeholder: 'ck_...', isSecret: true, helpText: 'The Consumer Key from WooCommerce REST API settings' },
        { key: 'consumerSecret', label: 'Consumer Secret', placeholder: 'cs_...', isSecret: true, helpText: 'The Consumer Secret from WooCommerce REST API settings' },
      ],
    },
    {
      id: 'discovering',
      type: 'discovery',
      title: 'Discovering Your Products',
      description: 'VIMO is scanning your WooCommerce store...',
      discoveryItems: [
        { icon: 'ShoppingCart', label: 'Products found', value: '36' },
        { icon: 'Package', label: 'Recent orders', value: '89' },
        { icon: 'BarChart3', label: 'Top categories', value: '5' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'what_woocommerce',
      question: 'What will VIMO do with my WooCommerce data?',
      answer: 'VIMO reads your products, orders, and inventory to create promotional content, product announcements, and sales campaigns.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'WooCommerce connected. We found:',
    items: [
      { icon: 'ShoppingCart', label: 'Products', value: '36' },
      { icon: 'Package', label: 'Recent orders', value: '89' },
      { icon: 'BarChart3', label: 'Top categories', value: '5' },
    ],
  },
  successActions: [
    { label: 'Create product announcement posts', cta: 'Create Posts', route: '/content' },
    { label: 'Launch sales campaign', cta: 'Launch Campaign', route: '/campaigns' },
    { label: 'Generate seasonal promotions', cta: 'Create Promos', route: '/content' },
  ],
  exampleOutputs: [
    'New product announcement social posts',
    'Sales and promotional campaign content',
    'Best-selling product spotlights',
    'Seasonal promotion ideas based on inventory',
  ],
};
