/**
 * VIMO Social — Social Accounts System
 *
 * Core principle: The user is connecting VIMO, not individual platforms.
 * VIMO connects directly to each platform's official OAuth/API.
 */

export type SocialPlatform =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'tiktok'
  | 'youtube'
  | 'pinterest'
  | 'threads'
  | 'bluesky';

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  name: string;
  handle?: string;
  avatarUrl?: string;
  followerCount: number;
  isConnected: boolean;
  lastSyncAt?: string;
  health: 'good' | 'warning' | 'error';
  healthMessage?: string;
  permissions: SocialPermission[];
  stats: AccountStats;
}

export interface AccountStats {
  postsThisMonth: number;
  lastPostDaysAgo: number | null;
  engagementRate: number;
  avgLikes: number;
  avgComments: number;
  reach: number;
}

export type SocialPermission =
  | 'publish'
  | 'schedule'
  | 'analytics'
  | 'comments'
  | 'messages';

export interface VimoSocialConnectionState {
  isConnected: boolean;
  connectionId?: string;
  connectedAt?: string;
  accounts: SocialAccount[];
  isLoading: boolean;
  error: string | null;
}

export interface VimoSocialSetupStep {
  id: string;
  title: string;
  description: string;
}

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; icon: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: 'Instagram' },
  { id: 'facebook', label: 'Facebook', icon: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'Linkedin' },
  { id: 'x', label: 'X', icon: 'Twitter' },
  { id: 'tiktok', label: 'TikTok', icon: 'Music' },
  { id: 'youtube', label: 'YouTube', icon: 'Youtube' },
  { id: 'pinterest', label: 'Pinterest', icon: 'PinIcon' },
  { id: 'threads', label: 'Threads', icon: 'AtSign' },
  { id: 'bluesky', label: 'Bluesky', icon: 'Globe' },
];

export const PERMISSION_LABELS: Record<SocialPermission, string> = {
  publish: 'Publish posts',
  schedule: 'Schedule content',
  analytics: 'Read analytics',
  comments: 'Respond to comments',
  messages: 'Monitor engagement',
};

export interface PublishingJob {
  id: string;
  content: string;
  mediaUrls?: string[];
  platforms: SocialPlatform[];
  scheduledAt?: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  publishedAt?: string;
  errorMessage?: string;
}

export interface PostContent {
  text: string;
  media?: { type: 'image' | 'video' | 'reel'; url: string }[];
  platforms: SocialPlatform[];
  scheduledAt?: string;
}
