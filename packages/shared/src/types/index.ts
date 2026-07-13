import type { z } from 'zod';
import {
  ConnectorSchema,
  BrandProfileSchema,
  CampaignSchema,
  ScheduledPostSchema,
  ApiKeySchema,
} from '../schemas';

export enum ApprovalMode {
  SAFE = 'safe',
  ASSISTED = 'assisted',
  AUTONOMOUS = 'autonomous',
}

export interface ApprovalRules {
  maxAutoPostsPerDay: number;
  requireApprovalForFirstPostOfDay: boolean;
  requireApprovalForPromoContent: boolean;
  autoApproveEngagementRepliesAboveConfidence: number;
  blockedHours: number[];
}

export interface Explanation {
  summary: string;
  dataPoints: string[];
  confidence: number;
  method: string;
}

export type Connector = z.infer<typeof ConnectorSchema>;
export type BrandProfile = z.infer<typeof BrandProfileSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type ScheduledPost = z.infer<typeof ScheduledPostSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
