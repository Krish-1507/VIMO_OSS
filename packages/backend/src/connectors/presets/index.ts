export type PresetConnector = {
  id: string;
  name: string;
  type: 'llm' | 'social' | 'analytics' | 'productivity' | 'custom' | 'media_generation';

  provider: string;
  description: string;
  category: string;
  iconSlug: string;
  connectorArchitecture: 'native' | 'mcp';
  authType: 'api_key' | 'oauth2' | 'oauth2_manual' | 'app_password' | 'none';
  requiredCredentials: {
    key: string;
    label: string;
    placeholder: string;
    isSecret: boolean;
    helpUrl?: string;
    helpText?: string;
  }[];
  tools: { name: string; description: string }[];
  workflows?: { name: string; description: string; trigger: string; output: string }[];

  /**
   * Honest readiness tier for this connector. This is the single source of
   * truth that the UI surfaces as a badge so we never over-claim coverage.
   *   - 'ready'        → VIMO can connect AND act end-to-end today
   *                       (publish / generate / query) without extra setup.
   *   - 'connect-only' → you can connect and read context/analytics, but
   *                       automated publishing for this platform is not yet
   *                       wired. We say so plainly instead of implying full
   *                       coverage.
   *   - 'coming-soon'  → advertised in the catalog but the connector/adapter
   *                       has not been built yet.
   */
  launchStatus?: LaunchStatus;
};

export type LaunchStatus = 'ready' | 'connect-only' | 'coming-soon';

/**
 * Curated, honest readiness map keyed by provider. Kept separate from the
 * (large) preset array so the truth is in one place and easy to audit.
 *
 * Rationale per tier:
 *  - 'ready'        : a real publish/act handler exists and is exercised by
 *                        VIMO's own tests (Instagram, Facebook, LinkedIn, X,
 *                        Threads, Reddit, Medium, Bluesky) or the capability is
 *                        fully implemented (LLM providers, Canva AI Designer,
 *                        Higgsfield video generation).
 *  - 'connect-only' : the connector can be connected and read data/context, but
 *                        end-to-end automated publishing is not implemented yet
 *                        (YouTube/TikTok/Pinterest need media uploads; the
 *                        MCP/intelligence and native data sources feed context
 *                        but don't publish on your behalf).
 */
export const PRESET_LAUNCH_STATUS: Record<string, LaunchStatus> = {
  // ── LLM providers — content generation works today ──
  openai: 'ready',
  anthropic: 'ready',
  google: 'ready',
  groq: 'ready',
  openrouter: 'ready',
  mistral: 'ready',
  ollama: 'ready',
  custom: 'ready',

  // ── Social publishing — real, tested publish handlers ──
  instagram: 'ready',
  facebook: 'ready',
  linkedin: 'ready',
  x: 'ready',
  threads: 'ready',
  reddit: 'ready',
  medium: 'ready',
  bluesky: 'ready',

  // ── Social connect + analytics, publishing not yet wired ──
  youtube: 'connect-only',
  tiktok: 'connect-only',
  pinterest: 'connect-only',

  // ── Design / media generation — implemented ──
  canva: 'ready',
  higgsfield: 'ready',

  // ── Native data / commerce / analytics — connect + feed context only ──
  wordpress: 'connect-only',
  shopify: 'connect-only',
  mailchimp: 'connect-only',
  'google-ads': 'connect-only',
  'facebook-ads': 'connect-only',
  'hubspot-native': 'connect-only',
  'google-analytics': 'connect-only',
  notion: 'connect-only',
  slack: 'connect-only',

  // ── MCP intelligence sources — connect + enrich context only ──
  github: 'connect-only',
  'notion-mcp': 'connect-only',
  'slack-mcp': 'connect-only',
  'google-drive': 'connect-only',
  linear: 'connect-only',
  'hubspot-mcp': 'connect-only',
  figma: 'connect-only',
  trello: 'connect-only',
  asana: 'connect-only',
  dropbox: 'connect-only',
};

export const LAUNCH_STATUS_META: Record<
  LaunchStatus,
  { label: string; description: string; tier: 1 | 2 | 3 }
> = {
  ready: {
    label: 'Ready',
    description: 'Connect and act end-to-end — publishing/automation works today.',
    tier: 1,
  },
  'connect-only': {
    label: 'Connect only',
    description:
      'You can connect and pull context/analytics, but automated publishing is not wired up yet.',
    tier: 2,
  },
  'coming-soon': {
    label: 'Coming soon',
    description: 'Advertised in the catalog — the connector has not been built yet.',
    tier: 3,
  },
};

/**
 * Resolve the honest readiness tier for a preset, preferring an explicit
 * per-preset override, then the curated provider map, then a safe default.
 */
export function resolveLaunchStatus(preset: PresetConnector): LaunchStatus {
  if (preset.launchStatus) return preset.launchStatus;
  if (PRESET_LAUNCH_STATUS[preset.provider]) return PRESET_LAUNCH_STATUS[preset.provider];
  // Default: be conservative. A connector that only lists tools but no
  // proven publish path is, at best, connect-only.
  return 'connect-only';
}

export const PRESET_CONNECTORS: PresetConnector[] = [
  // LLM Providers
  {
    id: 'preset-openai',
    name: 'OpenAI',
    type: 'llm',
    provider: 'openai',
    description: 'GPT models for text generation and embeddings',
    category: 'AI Providers',
    iconSlug: 'openai',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Access Key',
        placeholder: 'sk-...',
        isSecret: true,
        helpUrl: 'https://platform.openai.com/api-keys',
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using OpenAI models' },
      { name: 'llm_embed', description: 'Generate text embeddings' },
    ],
  },
  {
    id: 'preset-anthropic',
    name: 'Anthropic',
    type: 'llm',
    provider: 'anthropic',
    description: 'Claude models for text generation',
    category: 'AI Providers',
    iconSlug: 'anthropic',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Access Key',
        placeholder: 'sk-ant-...',
        isSecret: true,
        helpUrl: 'https://console.anthropic.com/',
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using Anthropic models' },
      { name: 'llm_embed', description: 'Generate text embeddings' },
    ],
  },
  {
    id: 'preset-google-gemini',
    name: 'Google Gemini',
    type: 'llm',
    provider: 'google',
    description: 'Gemini models for text generation and embeddings',
    category: 'AI Providers',
    iconSlug: 'google',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Access Key',
        placeholder: 'AIza...',
        isSecret: true,
        helpUrl: 'https://aistudio.google.com/app/apikey',
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using Google Gemini models' },
      { name: 'llm_embed', description: 'Generate text embeddings' },
    ],
  },
  {
    id: 'preset-groq',
    name: 'Groq',
    type: 'llm',
    provider: 'groq',
    description: 'High-speed inference for open models',
    category: 'AI Providers',
    iconSlug: 'groq',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Access Key',
        placeholder: 'gsk_...',
        isSecret: true,
        helpUrl: 'https://console.groq.com/keys',
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using Groq models' },
      { name: 'llm_embed', description: 'Generate text embeddings' },
    ],
  },
  {
    id: 'preset-openrouter',
    name: 'OpenRouter',
    type: 'llm',
    provider: 'openrouter',
    description: 'Access 300+ models via unified API',
    category: 'AI Providers',
    iconSlug: 'openrouter',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Access Key',
        placeholder: 'sk-or-...',
        isSecret: true,
        helpUrl: 'https://openrouter.ai/keys',
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using OpenRouter models' },
    ],
  },
  {
    id: 'preset-mistral',
    name: 'Mistral',
    type: 'llm',
    provider: 'mistral',
    description: 'Mistral AI models for text generation',
    category: 'AI Providers',
    iconSlug: 'mistral',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Access Key',
        placeholder: 'Your access key',
        isSecret: true,
        helpUrl: 'https://console.mistral.ai/',
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using Mistral models' },
      { name: 'llm_embed', description: 'Generate text embeddings' },
    ],
  },
  {
    id: 'preset-ollama',
    name: 'Ollama',
    type: 'llm',
    provider: 'ollama',
    description: 'Local LLM inference via Ollama',
    category: 'AI Providers',
    iconSlug: 'ollama',
    connectorArchitecture: 'native',
    authType: 'none',
    requiredCredentials: [
      {
        key: 'baseUrl',
        label: 'Ollama URL',
        placeholder: 'http://localhost:11434',
        isSecret: false,
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using local Ollama models' },
      { name: 'llm_embed', description: 'Generate text embeddings' },
    ],
  },
  {
    id: 'preset-custom-llm',
    name: 'Custom LLM',
    type: 'llm',
    provider: 'custom',
    description: 'Connect to a custom OpenAI-compatible provider',
    category: 'AI Providers',
    iconSlug: 'custom',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'providerName',
        label: 'Provider Name',
        placeholder: 'My Provider',
        isSecret: false,
      },
      {
        key: 'baseUrl',
        label: 'Base API URL',
        placeholder: 'https://api.myprovider.com/v1',
        isSecret: false,
      },
      {
        key: 'modelName',
        label: 'Model Name',
        placeholder: 'gpt-4o or my-model',
        isSecret: false,
      },
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'Your API key',
        isSecret: true,
      },
    ],
    tools: [
      { name: 'llm_complete', description: 'Generate text completions using custom provider' },
      { name: 'llm_embed', description: 'Generate text embeddings' },
    ],
  },
  // ── Native Social Platforms (Post & Engage) ──
  {
    id: 'preset-canva',
    name: 'Canva',
    type: 'social',
    provider: 'canva',
    description: 'Design graphics, templates, and visual content',
    category: 'Social',
    iconSlug: 'canva',
    connectorArchitecture: 'native',
    authType: 'oauth2' as const,
    requiredCredentials: [],
    tools: [
      { name: 'create_design', description: 'Create a new design from a template' },
      { name: 'search_templates', description: 'Search for design templates' },
      { name: 'export_design', description: 'Export a design as an image or PDF' },
      { name: 'get_brand_kits', description: 'Get brand kits and assets' },
    ],
  },
  {
    id: 'preset-instagram',
    name: 'Instagram',
    type: 'social',
    provider: 'instagram',
    description: 'Post images, reels, stories and manage comments',
    category: 'Social',
    iconSlug: 'instagram',
    connectorArchitecture: 'native',
    authType: 'oauth2_manual' as const,
    requiredCredentials: [
      {
        key: 'appId',
        label: 'App ID',
        placeholder: 'Paste your App ID',
        isSecret: false,
        helpText: 'From your Facebook Developer App dashboard',
        helpUrl: 'https://developers.facebook.com/',
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        placeholder: 'Paste your App Secret',
        isSecret: true,
        helpText: 'From your Facebook Developer App dashboard',
        helpUrl: 'https://developers.facebook.com/',
      },
    ],
    tools: [
      { name: 'post_image', description: 'Post an image to Instagram' },
      { name: 'post_reel', description: 'Post a reel to Instagram' },
      { name: 'post_story', description: 'Post a story to Instagram' },
      { name: 'get_comments', description: 'Get comments on a post' },
      { name: 'reply_comment', description: 'Reply to a comment' },
      { name: 'get_insights', description: 'Get post insights' },
    ],
  },
  {
    id: 'preset-linkedin',
    name: 'LinkedIn',
    type: 'social',
    provider: 'linkedin',
    description: 'Post text, images, and articles on LinkedIn',
    category: 'Social',
    iconSlug: 'linkedin',
    connectorArchitecture: 'native',
    authType: 'oauth2' as const,
    requiredCredentials: [],
    tools: [
      { name: 'post_text', description: 'Post text to LinkedIn' },
      { name: 'post_image', description: 'Post an image to LinkedIn' },
      { name: 'post_article', description: 'Post an article to LinkedIn' },
      { name: 'get_comments', description: 'Get comments on a post' },
      { name: 'reply_comment', description: 'Reply to a comment' },
      { name: 'get_analytics', description: 'Get post analytics' },
    ],
  },
  {
    id: 'preset-x',
    name: 'X (Twitter)',
    type: 'social',
    provider: 'x',
    description: 'Post tweets, threads, and manage mentions',
    category: 'Social',
    iconSlug: 'x',
    connectorArchitecture: 'native',
    authType: 'oauth2' as const,
    requiredCredentials: [],
    tools: [
      { name: 'post_tweet', description: 'Post a tweet' },
      { name: 'post_thread', description: 'Post a thread' },
      { name: 'reply_tweet', description: 'Reply to a tweet' },
      { name: 'get_mentions', description: 'Get mentions' },
      { name: 'get_analytics', description: 'Get analytics' },
    ],
  },
  {
    id: 'preset-tiktok',
    name: 'TikTok',
    type: 'social',
    provider: 'tiktok',
    description: 'Upload videos and manage comments on TikTok',
    category: 'Social',
    iconSlug: 'tiktok',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'TikTok Access Token',
        placeholder: 'Paste your TikTok OAuth access token',
        isSecret: true,
        helpUrl: 'https://developers.tiktok.com/',
      },
    ],
    tools: [
      { name: 'upload_video', description: 'Upload a video to TikTok' },
      { name: 'get_comments', description: 'Get comments on a video' },
      { name: 'get_analytics', description: 'Get video analytics' },
    ],
  },
  {
    id: 'preset-youtube',
    name: 'YouTube',
    type: 'social',
    provider: 'youtube',
    description: 'Upload videos and manage community posts',
    category: 'Social',
    iconSlug: 'youtube',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Access Token',
        placeholder: 'Paste your YouTube access token',
        isSecret: true,
        helpUrl: 'https://console.cloud.google.com/apis/credentials',
      },
    ],
    tools: [
      { name: 'upload_video', description: 'Upload a video to YouTube' },
      { name: 'post_community', description: 'Post to YouTube community' },
      { name: 'get_comments', description: 'Get comments on a video' },
      { name: 'get_analytics', description: 'Get channel analytics' },
    ],
  },
  {
    id: 'preset-facebook',
    name: 'Facebook',
    type: 'social',
    provider: 'facebook',
    description: 'Post text, images, and stories on Facebook',
    category: 'Social',
    iconSlug: 'facebook',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Page Access Token',
        placeholder: 'Paste your Facebook Page access token',
        isSecret: true,
        helpUrl: 'https://developers.facebook.com/docs/pages/access-tokens',
      },
    ],
    tools: [
      { name: 'post_text', description: 'Post text to Facebook' },
      { name: 'post_image', description: 'Post an image to Facebook' },
      { name: 'post_story', description: 'Post a story to Facebook' },
      { name: 'get_comments', description: 'Get comments on a post' },
      { name: 'reply_comment', description: 'Reply to a comment' },
    ],
  },
  {
    id: 'preset-pinterest',
    name: 'Pinterest',
    type: 'social',
    provider: 'pinterest',
    description: 'Create pins and boards on Pinterest',
    category: 'Social',
    iconSlug: 'pinterest',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Access Token',
        placeholder: 'Paste your Pinterest OAuth token',
        isSecret: true,
        helpUrl: 'https://developers.pinterest.com/docs/getting-started/authentication/',
      },
    ],
    tools: [
      { name: 'create_pin', description: 'Create a pin on Pinterest' },
      { name: 'create_board', description: 'Create a board on Pinterest' },
      { name: 'get_analytics', description: 'Get Pinterest analytics' },
    ],
  },
  {
    id: 'preset-reddit',
    name: 'Reddit',
    type: 'social',
    provider: 'reddit',
    description: 'Submit posts and manage comments on Reddit',
    category: 'Social',
    iconSlug: 'reddit',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Reddit Access Token',
        placeholder: 'Paste your Reddit OAuth access token',
        isSecret: true,
        helpUrl: 'https://www.reddit.com/prefs/apps',
      },
    ],
    tools: [
      { name: 'submit_post', description: 'Submit a post to Reddit' },
      { name: 'post_comment', description: 'Post a comment' },
      { name: 'get_karma', description: 'Get karma stats' },
    ],
  },
  {
    id: 'preset-bluesky',
    name: 'Bluesky',
    type: 'social',
    provider: 'bluesky',
    description: 'Post text and manage feeds on Bluesky',
    category: 'Social',
    iconSlug: 'bluesky',
    connectorArchitecture: 'native',
    authType: 'app_password',
    requiredCredentials: [
      {
        key: 'handle',
        label: 'Handle',
        placeholder: 'yourname.bsky.social',
        isSecret: false,
      },
      {
        key: 'appPassword',
        label: 'App Password',
        placeholder: 'Your app password',
        isSecret: true,
      },
    ],
    tools: [
      { name: 'post_text', description: 'Post text to Bluesky' },
      { name: 'reply_post', description: 'Reply to a post' },
      { name: 'get_feed', description: 'Get feed' },
    ],
  },
  {
    id: 'preset-threads',
    name: 'Threads',
    type: 'social',
    provider: 'threads',
    description: 'Post text and images on Threads',
    category: 'Social',
    iconSlug: 'threads',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Threads Access Token',
        placeholder: 'Paste your Threads API access token',
        isSecret: true,
        helpUrl: 'https://developers.facebook.com/docs/threads',
      },
    ],
    tools: [
      { name: 'post_text', description: 'Post text to Threads' },
      { name: 'post_image', description: 'Post an image to Threads' },
      { name: 'reply_post', description: 'Reply to a post' },
      { name: 'get_insights', description: 'Get post insights' },
    ],
  },
  {
    id: 'preset-medium',
    name: 'Medium',
    type: 'social',
    provider: 'medium',
    description: 'Publish articles and manage publications',
    category: 'Social',
    iconSlug: 'medium',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Integration Token',
        placeholder: 'Paste your Medium integration token',
        isSecret: true,
        helpUrl: 'https://medium.com/me/settings/security',
      },
    ],
    tools: [
      { name: 'create_post', description: 'Create a new article' },
      { name: 'publish_post', description: 'Publish a draft article' },
      { name: 'get_publications', description: 'Get your publications' },
      { name: 'get_analytics', description: 'Get article analytics' },
    ],
  },
  {
    id: 'preset-mailchimp',
    name: 'Mailchimp',
    type: 'social',
    provider: 'mailchimp',
    description: 'Email marketing, automation, and audience management',
    category: 'Social',
    iconSlug: 'mailchimp',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'Paste your Mailchimp API key (usX...)',
        isSecret: true,
        helpUrl: 'https://admin.mailchimp.com/account/api/',
      },
    ],
    tools: [
      { name: 'get_audiences', description: 'Get email audience lists' },
      { name: 'create_campaign', description: 'Create an email campaign' },
      { name: 'send_campaign', description: 'Send an email campaign' },
      { name: 'get_campaign_analytics', description: 'Get campaign analytics' },
      { name: 'manage_audience', description: 'Add or remove audience members' },
    ],
  },
  {
    id: 'preset-shopify',
    name: 'Shopify',
    type: 'social',
    provider: 'shopify',
    description: 'E-commerce store management, products, and orders',
    category: 'Social',
    iconSlug: 'shopify',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Admin API Token',
        placeholder: 'Paste your Shopify admin API token (shpat_...)',
        isSecret: true,
        helpUrl: 'https://shopify.dev/docs/api/admin',
      },
      {
        key: 'shopDomain',
        label: 'Shop Domain',
        placeholder: 'your-store.myshopify.com',
        isSecret: false,
      },
    ],
    tools: [
      { name: 'get_products', description: 'Get product listings' },
      { name: 'create_product', description: 'Create a new product' },
      { name: 'get_orders', description: 'Get recent orders' },
      { name: 'get_analytics', description: 'Get store analytics' },
      { name: 'manage_inventory', description: 'Update inventory levels' },
    ],
  },
  {
    id: 'preset-wordpress',
    name: 'WordPress',
    type: 'social',
    provider: 'wordpress',
    description: 'Publish and manage blog posts and pages',
    category: 'Productivity',
    iconSlug: 'wordpress',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Application Password',
        placeholder: 'Paste your WordPress application password',
        isSecret: true,
        helpUrl: 'https://wordpress.com/settings/security/',
      },
      {
        key: 'siteUrl',
        label: 'Site URL',
        placeholder: 'https://yoursite.com',
        isSecret: false,
      },
    ],
    tools: [
      { name: 'create_post', description: 'Create a new blog post' },
      { name: 'publish_post', description: 'Publish a draft post' },
      { name: 'get_posts', description: 'Get recent posts' },
      { name: 'get_analytics', description: 'Get site analytics' },
      { name: 'manage_categories', description: 'Manage post categories' },
    ],
  },
  {
    id: 'preset-google-ads',
    name: 'Google Ads',
    type: 'social',
    provider: 'google-ads',
    description: 'Manage PPC campaigns, ad groups, and keywords',
    category: 'Analytics',
    iconSlug: 'google-ads',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Access Token',
        placeholder: 'Paste your Google Ads access token',
        isSecret: true,
        helpUrl: 'https://console.cloud.google.com/apis/credentials',
      },
      {
        key: 'customerId',
        label: 'Customer ID',
        placeholder: '123-456-7890',
        isSecret: false,
      },
    ],
    tools: [
      { name: 'get_campaigns', description: 'Get ad campaigns' },
      { name: 'get_ad_performance', description: 'Get ad performance metrics' },
      { name: 'get_keywords', description: 'Get keyword performance' },
      { name: 'get_analytics', description: 'Get campaign analytics' },
    ],
  },
  {
    id: 'preset-facebook-ads',
    name: 'Facebook Ads',
    type: 'social',
    provider: 'facebook-ads',
    description: 'Manage Facebook and Instagram ad campaigns',
    category: 'Analytics',
    iconSlug: 'facebook-ads',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Ad Account Token',
        placeholder: 'Paste your Facebook Ads access token',
        isSecret: true,
        helpUrl: 'https://developers.facebook.com/docs/marketing-api/access',
      },
      {
        key: 'adAccountId',
        label: 'Ad Account ID',
        placeholder: 'act_123456789',
        isSecret: false,
      },
    ],
    tools: [
      { name: 'get_campaigns', description: 'Get ad campaigns' },
      { name: 'get_ad_performance', description: 'Get ad performance metrics' },
      { name: 'get_audiences', description: 'Get audience insights' },
      { name: 'get_analytics', description: 'Get ad analytics' },
    ],
  },
  // ── Analytics & Productivity ──
  {
    id: 'preset-hubspot',
    name: 'HubSpot (Native)',
    type: 'analytics',
    provider: 'hubspot-native',
    description: 'CRM, marketing automation, and sales tools (non-MCP)',
    category: 'Analytics',
    iconSlug: 'hubspot',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Private App Token',
        placeholder: 'Paste your HubSpot private app token',
        isSecret: true,
        helpUrl: 'https://developers.hubspot.com/docs/api/private-apps',
      },
    ],
    tools: [
      { name: 'get_contacts', description: 'Get CRM contacts' },
      { name: 'create_contact', description: 'Create a new contact' },
      { name: 'get_deals', description: 'Get sales deals' },
      { name: 'create_email_campaign', description: 'Create an email marketing campaign' },
      { name: 'get_analytics', description: 'Get marketing analytics' },
    ],
  },
  // ── MCP Intelligence Sources (Feed VIMO Context) ──
  {
    id: 'preset-github-mcp',
    name: 'GitHub',
    type: 'analytics',
    provider: 'github',
    description: 'Connect GitHub repos to automatically generate launch posts, changelogs, and dev-focused content',
    category: 'Productivity',
    iconSlug: 'github',
    connectorArchitecture: 'mcp',
    authType: 'api_key',
    requiredCredentials: [
      { key: 'accessToken', label: 'Access Token', placeholder: 'ghp_...', isSecret: true, helpUrl: 'https://github.com/settings/tokens', helpText: 'Generate a classic token with repo scope' },
    ],
    tools: [
      { name: 'get_commits', description: 'Get recent commits from a repository' },
      { name: 'get_releases', description: 'Get recent releases' },
      { name: 'get_pull_requests', description: 'Get recent pull requests' },
    ],
    workflows: [
      { name: 'Release Post Generator', description: 'When new commits are pushed, automatically generate launch posts', trigger: 'New commits detected in connected repository', output: 'LinkedIn article, Twitter thread, Instagram carousel caption' },
      { name: 'Changelog Creator', description: 'Turn GitHub releases into polished changelogs', trigger: 'New GitHub release tag created', output: 'Blog post draft, newsletter section, social announcement' },
    ],
  },
  {
    id: 'preset-notion-mcp',
    name: 'Notion',
    type: 'productivity',
    provider: 'notion-mcp',
    description: 'Turn Notion docs into social posts, convert meeting notes into announcements',
    category: 'Productivity',
    iconSlug: 'notion',
    connectorArchitecture: 'mcp',
    authType: 'api_key',
    requiredCredentials: [
      { key: 'integrationToken', label: 'Integration Token', placeholder: 'secret_...', isSecret: true, helpUrl: 'https://www.notion.so/my-integrations' },
    ],
    tools: [
      { name: 'query_database', description: 'Query a Notion database for pages' },
      { name: 'read_page', description: 'Read a Notion page content' },
      { name: 'list_databases', description: 'List accessible databases' },
    ],
    workflows: [
      { name: 'Doc to Content', description: 'Turn Notion docs into social posts automatically', trigger: 'A Notion page is updated or published', output: 'LinkedIn post, Twitter thread, newsletter summary' },
      { name: 'Meeting Notes to Announcements', description: 'Convert meeting notes into external communications', trigger: 'Meeting notes page updated', output: 'Team announcement, social post about decisions made' },
    ],
  },
  {
    id: 'preset-slack-mcp',
    name: 'Slack',
    type: 'productivity',
    provider: 'slack-mcp',
    description: 'Detect wins in Slack and create celebratory content automatically',
    category: 'Productivity',
    iconSlug: 'slack',
    connectorArchitecture: 'mcp',
    authType: 'oauth2',
    requiredCredentials: [
      { key: 'accessToken', label: 'Slack Bot Token', placeholder: 'xoxb-...', isSecret: true, helpUrl: 'https://api.slack.com/apps', helpText: 'Create a Slack app at api.slack.com/apps, add the Bot Token Scopes, install it to your workspace, and paste the Bot Token here.' },
    ],
    tools: [
      { name: 'get_messages', description: 'Get messages from a channel' },
      { name: 'get_channels', description: 'Get list of channels' },
      { name: 'search_messages', description: 'Search messages by keyword' },
    ],
    workflows: [
      { name: 'Win Announcements', description: 'Detect wins in Slack and create celebratory content', trigger: 'Message containing "we closed", "we launched", "we hit" detected in #wins channel', output: 'LinkedIn announcement, Twitter post, newsletter mention' },
      { name: 'Launch Detector', description: 'When marketing announces a launch in Slack, create all content immediately', trigger: '#marketing or #launches channel message detected', output: 'Full launch content package across all connected platforms' },
    ],
  },
  {
    id: 'preset-google-drive-mcp',
    name: 'Google Drive',
    type: 'productivity',
    provider: 'google-drive',
    description: 'Access Google Docs, Sheets, and Drive files to turn them into content',
    category: 'Productivity',
    iconSlug: 'google-drive',
    connectorArchitecture: 'mcp',
    authType: 'oauth2',
    requiredCredentials: [
      { key: 'accessToken', label: 'Google OAuth Token', placeholder: 'Paste your Google OAuth token', isSecret: true, helpUrl: 'https://console.cloud.google.com/apis/credentials' },
    ],
    tools: [
      { name: 'list_files', description: 'List files in Drive' },
      { name: 'read_file', description: 'Read a file from Drive' },
      { name: 'search_files', description: 'Search for files by name or content' },
    ],
    workflows: [
      { name: 'Doc to Content', description: 'Turn Google Docs into social posts automatically', trigger: 'A Google Doc is updated or shared', output: 'LinkedIn post, Twitter thread, newsletter summary' },
    ],
  },
  {
    id: 'preset-linear-mcp',
    name: 'Linear',
    type: 'productivity',
    provider: 'linear',
    description: 'Connect Linear to generate content from completed projects and updates',
    category: 'Productivity',
    iconSlug: 'linear',
    connectorArchitecture: 'mcp',
    authType: 'api_key',
    requiredCredentials: [
      { key: 'apiKey', label: 'Access Key', placeholder: 'lin_api_...', isSecret: true, helpUrl: 'https://linear.app/settings/api' },
    ],
    tools: [
      { name: 'get_projects', description: 'Get recent projects' },
      { name: 'get_issues', description: 'Get recent completed issues' },
      { name: 'get_cycles', description: 'Get cycle data' },
    ],
    workflows: [
      { name: 'Sprint Release Notes', description: 'Turn completed Linear cycles into social updates', trigger: 'Cycle completed', output: 'LinkedIn update, Twitter thread, Slack announcement' },
    ],
  },
  {
    id: 'preset-hubspot-mcp',
    name: 'HubSpot',
    type: 'analytics',
    provider: 'hubspot-mcp',
    description: 'Connect HubSpot CRM to generate content from deals, contacts, and analytics',
    category: 'Analytics',
    iconSlug: 'hubspot',
    connectorArchitecture: 'mcp',
    authType: 'oauth2',
    requiredCredentials: [
      { key: 'accessToken', label: 'Private App Token', placeholder: 'Paste your HubSpot private app token', isSecret: true, helpUrl: 'https://developers.hubspot.com/docs/api/private-apps' },
    ],
    tools: [
      { name: 'get_contacts', description: 'Get CRM contacts' },
      { name: 'get_deals', description: 'Get sales deals' },
      { name: 'get_analytics', description: 'Get marketing analytics' },
    ],
    workflows: [
      { name: 'Deal Announcements', description: 'Generate social content when a major deal closes', trigger: 'Deal status changed to closed-won', output: 'LinkedIn announcement, Twitter post, newsletter mention' },
    ],
  },
  // Analytics & Productivity
  {
    id: 'preset-google-analytics',
    name: 'Google Analytics 4',
    type: 'analytics',
    provider: 'google-analytics',
    description: 'Track sessions, page views, and conversions',
    category: 'Analytics',
    iconSlug: 'google-analytics',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Google Access Token',
        placeholder: 'Paste your Google access token',
        isSecret: true,
        helpUrl: 'https://console.cloud.google.com/apis/credentials',
      },
      {
        key: 'propertyId',
        label: 'Property ID',
        placeholder: '123456789',
        isSecret: false,
      },
    ],
    tools: [
      { name: 'get_sessions', description: 'Get session data' },
      { name: 'get_page_views', description: 'Get page view data' },
      { name: 'get_conversions', description: 'Get conversion data' },
      { name: 'get_audience', description: 'Get audience data' },
    ],
  },
  {
    id: 'preset-notion',
    name: 'Notion (Native)',
    type: 'productivity',
    provider: 'notion',
    description: 'Create and manage pages and databases in Notion (non-MCP)',
    category: 'Productivity',
    iconSlug: 'notion',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'integrationToken',
        label: 'Integration Token',
        placeholder: 'secret_...',
        isSecret: true,
        helpUrl: 'https://www.notion.so/my-integrations',
      },
    ],
    tools: [
      { name: 'create_page', description: 'Create a page in Notion' },
      { name: 'update_page', description: 'Update a page in Notion' },
      { name: 'query_database', description: 'Query a Notion database' },
      { name: 'read_page', description: 'Read a Notion page' },
    ],
  },
  {
    id: 'preset-slack',
    name: 'Slack (Native)',
    type: 'productivity',
    provider: 'slack',
    description: 'Send messages and manage channels in Slack (non-MCP)',
    category: 'Productivity',
    iconSlug: 'slack',
    connectorArchitecture: 'native',
    authType: 'oauth2',
    requiredCredentials: [
      {
        key: 'accessToken',
        label: 'Bot Token',
        placeholder: 'xoxb-...',
        isSecret: true,
        helpUrl: 'https://api.slack.com/apps',
      },
    ],
    tools: [
      { name: 'send_message', description: 'Send a message in Slack' },
      { name: 'post_to_channel', description: 'Post to a Slack channel' },
      { name: 'create_channel', description: 'Create a Slack channel' },
      { name: 'get_channels', description: 'Get list of channels' },
    ],
  },
  // ── Video Generation ──
  {
    id: 'preset-higgsfield',
    name: 'Higgsfield AI',
    type: 'media_generation',
    provider: 'higgsfield',
    description: 'Generate cinematic AI videos for your social content',
    category: 'Video Generation',
    iconSlug: 'higgsfield',
    connectorArchitecture: 'native',
    authType: 'api_key',
    requiredCredentials: [
      {
        key: 'apiKey',
        label: 'Higgsfield Access Key',
        placeholder: 'hf_...',
        isSecret: true,
        helpText: 'Find your access key at app.higgsfield.ai/settings/api',
        helpUrl: 'https://app.higgsfield.ai/settings/api',
      },
    ],
    tools: [
      { name: 'generate_video', description: 'Generate a cinematic AI video from a text prompt' },
      { name: 'check_generation_status', description: 'Check the status of a video generation job' },
      { name: 'list_styles', description: 'List available video generation styles' },
    ],
  },
  // ── Additional One-Click OAuth Providers ──
  {
    id: 'preset-figma',
    name: 'Figma',
    type: 'productivity',
    provider: 'figma',
    description: 'Access design files and collaborate on creative assets',
    category: 'Productivity',
    iconSlug: 'figma',
    connectorArchitecture: 'mcp',
    authType: 'oauth2',
    requiredCredentials: [],
    tools: [
      { name: 'get_files', description: 'Get Figma files' },
      { name: 'get_file_comments', description: 'Get comments on a file' },
      { name: 'post_comment', description: 'Post a comment to a file' },
    ],
    workflows: [
      { name: 'Design Feedback', description: 'Automatically collect design feedback and generate summary reports', trigger: 'New comments on Figma file', output: 'Slack notification, summary report' },
    ],
  },
  {
    id: 'preset-trello',
    name: 'Trello',
    type: 'productivity',
    provider: 'trello',
    description: 'Manage boards, cards, and collaborate with your team',
    category: 'Productivity',
    iconSlug: 'trello',
    connectorArchitecture: 'mcp',
    authType: 'oauth2',
    requiredCredentials: [],
    tools: [
      { name: 'get_boards', description: 'Get Trello boards' },
      { name: 'get_cards', description: 'Get cards on a board' },
      { name: 'create_card', description: 'Create a new card' },
    ],
    workflows: [
      { name: 'Sprint Updates', description: 'Generate content from Trello board activity', trigger: 'Card moved to Done column', output: 'LinkedIn post, Twitter thread' },
    ],
  },
  {
    id: 'preset-asana',
    name: 'Asana',
    type: 'productivity',
    provider: 'asana',
    description: 'Track projects, tasks, and team collaboration',
    category: 'Productivity',
    iconSlug: 'asana',
    connectorArchitecture: 'mcp',
    authType: 'oauth2',
    requiredCredentials: [],
    tools: [
      { name: 'get_projects', description: 'Get Asana projects' },
      { name: 'get_tasks', description: 'Get tasks in a project' },
      { name: 'complete_task', description: 'Mark a task as complete' },
    ],
    workflows: [
      { name: 'Project Milestones', description: 'Announce project milestones from Asana', trigger: 'Task marked complete in Milestone project', output: 'LinkedIn post, newsletter mention' },
    ],
  },
  {
    id: 'preset-dropbox',
    name: 'Dropbox',
    type: 'productivity',
    provider: 'dropbox',
    description: 'Access files, documents, and collaborate on shared content',
    category: 'Productivity',
    iconSlug: 'dropbox',
    connectorArchitecture: 'mcp',
    authType: 'oauth2',
    requiredCredentials: [],
    tools: [
      { name: 'list_files', description: 'List files in a folder' },
      { name: 'get_file', description: 'Get file contents' },
      { name: 'upload_file', description: 'Upload a file' },
    ],
    workflows: [
      { name: 'Content Library', description: 'Access marketing assets from Dropbox', trigger: 'New file added to Marketing folder', output: 'Asset ready for social post creation' },
    ],
  },
];

