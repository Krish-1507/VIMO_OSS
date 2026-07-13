import type { ConnectorPack, PackCategory } from './types';
import { socialAccountsPack } from './packs/socialAccountsPack';

// Knowledge Packs
import { githubPack } from './packs/githubPack';
import { notionPack } from './packs/notionPack';
import { slackPack } from './packs/slackPack';
import { googleDrivePack } from './packs/googleDrivePack';
import { linearPack } from './packs/linearPack';
import { hubspotPack } from './packs/hubspotPack';

// Intelligence Packs
import { competitorTrackingPack } from './packs/competitorTrackingPack';
import { seoPack } from './packs/seoPack';
import { websiteAnalyticsPack } from './packs/websiteAnalyticsPack';
import { customerFeedbackPack } from './packs/customerFeedbackPack';
import { reviewMonitoringPack } from './packs/reviewMonitoringPack';
import { marketResearchPack } from './packs/marketResearchPack';

// Creative & Commerce Packs
import { canvaPack } from './packs/canvaPack';
import { figmaPack } from './packs/figmaPack';
import { adobeExpressPack } from './packs/adobeExpressPack';
import { shopifyPack } from './packs/shopifyPack';
import { woocommercePack } from './packs/woocommercePack';
import { stripePack } from './packs/stripePack';

export * from './types';

/**
 * Social Accounts — a single unified pack for all social platforms.
 * Powered by VIMO Social. Used for publishing, scheduling, engagement, analytics.
 * DO NOT MODIFY — kept separate as the foundation layer.
 */
export const SOCIAL_ACCOUNTS_PACK: ConnectorPack = socialAccountsPack;

/**
 * Knowledge Packs — give VIMO context about your business.
 * VIMO learns from your docs, code, conversations, and CRM.
 */
export const KNOWLEDGE_PACKS: ConnectorPack[] = [
  githubPack,
  notionPack,
  slackPack,
  googleDrivePack,
  linearPack,
  hubspotPack,
];

/**
 * Intelligence Packs — help VIMO discover opportunities.
 * Market research, competitor tracking, SEO, analytics, and feedback monitoring.
 */
export const INTELLIGENCE_PACKS: ConnectorPack[] = [
  competitorTrackingPack,
  seoPack,
  websiteAnalyticsPack,
  customerFeedbackPack,
  reviewMonitoringPack,
  marketResearchPack,
];

/**
 * Creative & Commerce Packs — turn your products and brand into content.
 * Design tools and e-commerce platforms.
 */
export const CREATIVE_COMMERCE_PACKS: ConnectorPack[] = [
  canvaPack,
  figmaPack,
  adobeExpressPack,
  shopifyPack,
  woocommercePack,
  stripePack,
];

/**
 * Category metadata for the Packs Marketplace.
 */
export const PACK_CATEGORIES: {
  id: PackCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
}[] = [
  {
    id: 'social_accounts',
    label: 'Social Accounts',
    description: 'Publish, schedule, analyze, and engage across platforms',
    icon: 'Users',
    color: 'from-teal-500 to-emerald-500',
  },
  {
    id: 'knowledge_packs',
    label: 'Knowledge Packs',
    description: 'Give VIMO context about your business',
    icon: 'BookOpen',
    color: 'from-purple-500 to-indigo-500',
  },
  {
    id: 'intelligence_packs',
    label: 'Intelligence Packs',
    description: 'Discover opportunities and track markets',
    icon: 'Radar',
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'creative_commerce',
    label: 'Creative & Commerce',
    description: 'Turn products and designs into content',
    icon: 'Palette',
    color: 'from-pink-500 to-rose-500',
  },
];

/**
 * All available packs for search/indexing.
 */
export const ALL_PACKS: ConnectorPack[] = [
  socialAccountsPack,
  ...KNOWLEDGE_PACKS,
  ...INTELLIGENCE_PACKS,
  ...CREATIVE_COMMERCE_PACKS,
];

/**
 * Popular packs — shown in the "Popular Packs" section.
 */
export const POPULAR_PACKS: ConnectorPack[] = ALL_PACKS.filter((p) => p.isPopular);

export function getPackById(id: string): ConnectorPack | undefined {
  return ALL_PACKS.find((p) => p.id === id);
}

export function getPackByProvider(provider: string): ConnectorPack | undefined {
  return ALL_PACKS.find((p) => p.provider === provider);
}

export function getPacksByCategory(category: PackCategory): ConnectorPack[] {
  const map: Record<PackCategory, ConnectorPack[]> = {
    social_accounts: [socialAccountsPack],
    knowledge_packs: KNOWLEDGE_PACKS,
    intelligence_packs: INTELLIGENCE_PACKS,
    creative_commerce: CREATIVE_COMMERCE_PACKS,
  };
  return map[category] || [];
}
