import { z } from 'zod';

import { VIMO_CONNECTOR_TYPES } from './connectorTypes';

export const ConnectorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(VIMO_CONNECTOR_TYPES as unknown as [string, ...string[]]),
  provider: z.string(),
  status: z.enum(['active', 'inactive', 'error', 'rate_limited']),
  config: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});


export const BrandProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  industry: z.string(),
  audience: z.string(),
  toneKeywords: z.array(z.string()),
  examplePosts: z.array(z.string()),
  voiceFingerprint: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  goal: z.string(),
  status: z.enum(['draft', 'active', 'paused', 'completed']),
  brandProfileId: z.string(),
  channels: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string().optional(),
  strategy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ScheduledPostSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().optional(),
  brandProfileId: z.string(),
  content: z.string(),
  platform: z.string(),
  scheduledAt: z.string(),
  status: z.enum(['pending', 'published', 'failed', 'cancelled', 'awaiting_approval', 'draft', 'autopilot_draft']),
  mediaUrls: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.string(),
  keyPreview: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
