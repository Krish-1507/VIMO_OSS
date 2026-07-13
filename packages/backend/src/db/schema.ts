import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const connectors = sqliteTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  status: text('status').default('inactive').notNull(),
  configJson: text('config_json').notNull(),
  encryptedCredentials: text('encrypted_credentials').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  isDemo: integer('is_demo').default(0),
});

export const brandProfiles = sqliteTable('brand_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  industry: text('industry').notNull(),
  audience: text('audience').notNull(),
  website: text('website'),
  logoUrl: text('logo_url'),
  toneKeywordsJson: text('tone_keywords_json').notNull(),
  examplePostsJson: text('example_posts_json').notNull(),
  voiceFingerprint: text('voice_fingerprint'),
  memoryVersion: integer('memory_version').default(1),
  totalPostsGenerated: integer('total_posts_generated').default(0),
  totalCampaignsRun: integer('total_campaigns_run').default(0),
  performanceLessons: text('performance_lessons'),
  audienceInsights: text('audience_insights'),
  campaignMemory: text('campaign_memory'),
  contentDNA: text('content_dna'),
  adaptivePlan: text('adaptive_plan'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  isDemo: integer('is_demo').default(0),
});

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  goal: text('goal').notNull(),
  status: text('status').default('draft').notNull(),
  brandProfileId: text('brand_profile_id').notNull(),
  channelsJson: text('channels_json').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  strategy: text('strategy'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const scheduledPosts = sqliteTable('scheduled_posts', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id'),
  brandProfileId: text('brand_profile_id').notNull(),
  content: text('content').notNull(),
  platform: text('platform').notNull(),
  scheduledAt: text('scheduled_at').notNull(),
  status: text('status').default('pending').notNull(),
  mediaUrlsJson: text('media_urls_json'),
  metadataJson: text('metadata_json'),
  // Growth loop: whether we already evaluated this post for high performance
  isHighPerformerChecked: integer('is_high_performer_checked'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  scheduledPostsBrandProfileIdIdx: index('idx_scheduled_posts_brand_profile_id').on(table.brandProfileId),
  scheduledPostsStatusIdx: index('idx_scheduled_posts_status').on(table.status),
  scheduledPostsScheduledAtIdx: index('idx_scheduled_posts_scheduled_at').on(table.scheduledAt),
  scheduledPostsPlatformIdx: index('idx_scheduled_posts_platform').on(table.platform),
}));

export const growthActions = sqliteTable('growth_actions', {
  id: text('id').primaryKey(),
  sourcePostId: text('source_post_id').notNull(),
  brandProfileId: text('brand_profile_id').notNull(),
  // enum-like: generate_variation | repost_to_platform | create_reel | test_stronger_hook
  actionType: text('action_type').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
});

export const agentLogs = sqliteTable('agent_logs', {
  id: text('id').primaryKey(),
  agentType: text('agent_type').notNull(),
  action: text('action').notNull(),
  input: text('input').notNull(),
  output: text('output').notNull(),
  connectorsCalled: text('connectors_called').notNull(),
  status: text('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: text('created_at').notNull(),
});

export const viralJobs = sqliteTable('viral_jobs', {
  id: text('id').primaryKey(),
  videoPath: text('video_path').notNull(),
  status: text('status').default('queued').notNull(),
  transcript: text('transcript'),
  momentsJson: text('moments_json'),
  clipsJson: text('clips_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const engagementQueue = sqliteTable('engagement_queue', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  platform: text('platform').notNull(),
  externalPostId: text('external_post_id').notNull(),
  authorName: text('author_name').notNull(),
  authorHandle: text('author_handle'),
  content: text('content').notNull(),
  type: text('type').default('comment').notNull(),
  status: text('status').default('pending').notNull(),
  replyStatus: text('reply_status'),
  postId: text('post_id'),
  receivedAt: text('received_at'),
  replyContent: text('reply_content'),
  confidenceScore: integer('confidence_score'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  engagementQueueReplyStatusIdx: index('idx_engagement_queue_reply_status').on(table.replyStatus),
  engagementQueueBrandProfileIdIdx: index('idx_engagement_queue_brand_profile_id').on(table.brandProfileId),
  engagementQueueStatusIdx: index('idx_engagement_queue_status').on(table.status),
}));

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const userProfiles = sqliteTable('user_profiles', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  originalFilename: text('original_filename').notNull(),
  storedFilename: text('stored_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  publicUrl: text('public_url'),
  createdAt: text('created_at').notNull(),
});

export const accountSnapshots = sqliteTable('account_snapshots', {
  id: text('id').primaryKey(),
  connectorId: text('connector_id').notNull(),
  platform: text('platform').notNull(),
  followersCount: integer('followers_count').notNull().default(0),
  followingCount: integer('following_count').notNull().default(0),
  postsCount: integer('posts_count').notNull().default(0),
  snapshotDate: text('snapshot_date').notNull(),
  createdAt: text('created_at').notNull(),
  isDemo: integer('is_demo').default(0),
});

export const trendSignals = sqliteTable('trend_signals', {
  id: text('id').primaryKey(),
  signalType: text('signal_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  sourceUrl: text('source_url'),
  relevanceScore: integer('relevance_score').notNull(),
  actionSuggestion: text('action_suggestion'),
  isActedOn: integer('is_acted_on').default(0).notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const competitorProfiles = sqliteTable('competitor_profiles', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  competitorName: text('competitor_name').notNull(),
  platformHandle: text('platform_handle').notNull(),
  platform: text('platform').notNull(),
  followersCount: integer('followers_count'),
  lastCheckedAt: text('last_checked_at'),
  createdAt: text('created_at').notNull(),
});

export const competitorSnapshots = sqliteTable('competitor_snapshots', {
  id: text('id').primaryKey(),
  competitorProfileId: text('competitor_profile_id').notNull(),
  followersCount: integer('followers_count'),
  postsThisWeek: integer('posts_this_week'),
  topContentTheme: text('top_content_theme'),
  avgEngagementRate: real('avg_engagement_rate'),
  snapshotDate: text('snapshot_date').notNull(),
  createdAt: text('created_at').notNull(),
});

export const brandRoasts = sqliteTable('brand_roasts', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  roastJson: text('roast_json').notNull(),
  overallScore: integer('overall_score').notNull(),
  createdAt: text('created_at').notNull(),
});

export const autopilotSessions = sqliteTable('autopilot_sessions', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  audienceDescription: text('audience_description').notNull(),
  primaryGoal: text('primary_goal').notNull(),
  goalType: text('goal_type').notNull(),
  durationDays: integer('duration_days').notNull(),
  channelsJson: text('channels_json'),
  status: text('status').notNull(),
  progressPercent: integer('progress_percent').default(0).notNull(),
  strategyDocument: text('strategy_document'),
  contentCalendarJson: text('content_calendar_json'),
  scheduledPostIdsJson: text('scheduled_post_ids_json'),
  logJson: text('log_json'),
  timelineJson: text('timeline_json'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
});

export const autopilotCheckpoints = sqliteTable('autopilot_checkpoints', {
  id: text('id').primaryKey(),
  autopilotId: text('autopilot_id').notNull(),
  checkDate: text('check_date').notNull(),
  checkType: text('check_type').notNull(),
  status: text('status').default('pending').notNull(),
  createdAt: text('created_at').notNull(),
});

export const assistantMessages = sqliteTable('assistant_messages', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  intentType: text('intent_type'),
  systemActionTaken: text('system_action_taken'),
  systemActionResult: text('system_action_result'),
  sessionId: text('session_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: text('is_read').default('false').notNull(),
  actionUrl: text('action_url'),
  createdAt: text('created_at').notNull(),
});

export const higgsfieldJobs = sqliteTable('higgsfield_jobs', {
  id: text('id').primaryKey(),

  connectorId: text('connector_id').notNull(),
  brandProfileId: text('brand_profile_id').notNull(),

  // Higgsfield job id returned by Higgsfield
  jobId: text('job_id').notNull(),

  // Generation inputs
  prompt: text('prompt').notNull(),
  aspectRatio: text('aspect_ratio').notNull(), // enum-like: '9:16' | '16:9' | '1:1'
  duration: integer('duration_seconds').notNull(), // seconds 3..10
  style: text('style').notNull(), // cinematic style
  referenceImageUrl: text('reference_image_url'),

  // status
  status: text('status').notNull().default('queued'), // queued | processing | completed | failed
  videoUrl: text('video_url'), // nullable
  thumbnailUrl: text('thumbnail_url'), // nullable
  localFilePath: text('local_file_path'), // nullable
  errorMessage: text('error_message'), // nullable

  // timestamps
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
});

export const directorSessions = sqliteTable('director_sessions', {

  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  trigger: text('trigger').notNull(),
  researchReportJson: text('research_report_json'),
  analyticsInsightsJson: text('analytics_insights_json'),
  contentOpportunitiesJson: text('content_opportunities_json'),
  engagementStatsJson: text('engagement_stats_json'),
  directorSummary: text('director_summary'),
  recommendedActionsJson: text('recommended_actions_json'),
  morningBriefingJson: text('morning_briefing_json'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  directorSessionsBrandProfileIdIdx: index('idx_director_sessions_brand_profile_id').on(table.brandProfileId),
}));

export const marketingMemory = sqliteTable('marketing_memory', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  entryType: text('entry_type').notNull(),
  entryDate: text('entry_date').notNull(),
  weekLabel: text('week_label').notNull(),
  summary: text('summary').notNull(),
  metrics: text('metrics'),
  sentiment: text('sentiment').notNull().default('neutral'),
  tags: text('tags'),
  linkedEntityId: text('linked_entity_id'),
  linkedEntityType: text('linked_entity_type'),
  lessonsJson: text('lessons_json'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  marketingMemoryBrandProfileIdIdx: index('idx_marketing_memory_brand_profile_id').on(table.brandProfileId),
  marketingMemoryEntryDateIdx: index('idx_marketing_memory_entry_date').on(table.entryDate),
}));

export const llmUsage = sqliteTable('llm_usage', {
  id: text('id').primaryKey(),
  taskType: text('task_type').notNull(),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUSD: real('cost_usd').notNull(),
  brandProfileId: text('brand_profile_id'),
  relatedEntityId: text('related_entity_id'),
  relatedEntityType: text('related_entity_type'),
  createdAt: text('created_at').notNull(),
});

export const approvalRequests = sqliteTable('approval_requests', {
  id: text('id').primaryKey(),
  requestType: text('request_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  brandProfileId: text('brand_profile_id').notNull(),
  requestedBy: text('requested_by').notNull(),
  urgency: text('urgency').notNull(),
  status: text('status').notNull().default('pending'),
  reviewedAt: text('reviewed_at'),
  reviewedBy: text('reviewed_by'),
  rejectionReason: text('rejection_reason'),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
}, (table) => ({
  approvalRequestsStatusIdx: index('idx_approval_requests_status').on(table.status),
  approvalRequestsBrandProfileIdIdx: index('idx_approval_requests_brand_profile_id').on(table.brandProfileId),
  approvalRequestsRequestTypeIdx: index('idx_approval_requests_request_type').on(table.requestType),
  approvalRequestsCreatedAtIdx: index('idx_approval_requests_created_at').on(table.createdAt),
}));

export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  potentialImpact: text('potential_impact').notNull(),
  urgency: text('urgency').notNull(),
  actionLabel: text('action_label').notNull(),
  actionType: text('action_type').notNull(),
  actionPayloadJson: text('action_payload_json').notNull(),
  isActedOn: integer('is_acted_on').default(0).notNull(),
  detectedAt: text('detected_at').notNull(),
  actedOnAt: text('acted_on_at'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  opportunitiesBrandProfileIdIdx: index('idx_opportunities_brand_profile_id').on(table.brandProfileId),
  opportunitiesIsActedOnIdx: index('idx_opportunities_is_acted_on').on(table.isActedOn),
}));

export const knowledgeEntities = sqliteTable('knowledge_entities', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  // enum: content_type, platform, audience_segment, time_window, topic, content_format, hashtag_category, campaign_type
  entityType: text('entity_type').notNull(),
  entityLabel: text('entity_label').notNull(),
  properties: text('properties'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  knowledgeEntitiesBrandProfileIdIdx: index('idx_knowledge_entities_brand_profile_id').on(table.brandProfileId),
  knowledgeEntitiesTypeLabelIdx: index('idx_knowledge_entities_type_label').on(table.brandProfileId, table.entityType, table.entityLabel),
}));

export const knowledgeRelationships = sqliteTable('knowledge_relationships', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  fromEntityId: text('from_entity_id').notNull(),
  toEntityId: text('to_entity_id').notNull(),
  // enum: performs_well_with, performs_poorly_with, resonates_with, best_time_for, drives, correlates_with
  relationshipType: text('relationship_type').notNull(),
  strength: real('strength').notNull(),
  sampleSize: integer('sample_size').notNull(),
  lastObserved: text('last_observed').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  knowledgeRelationshipsBrandProfileIdIdx: index('idx_knowledge_relationships_brand_profile_id').on(table.brandProfileId),
  knowledgeRelationshipsFromIdx: index('idx_knowledge_relationships_from').on(table.fromEntityId),
  knowledgeRelationshipsToIdx: index('idx_knowledge_relationships_to').on(table.toEntityId),
  knowledgeRelationshipsTypeIdx: index('idx_knowledge_relationships_type').on(table.relationshipType),
  knowledgeRelationshipsUnique: index('idx_knowledge_relationships_unique').on(
    table.brandProfileId,
    table.fromEntityId,
    table.toEntityId,
    table.relationshipType
  ),
}));

export const contentLibrary = sqliteTable('content_library', {
  id: text('id').primaryKey(),
  brandProfileId: text('brand_profile_id').notNull(),
  type: text('type').notNull(),           // 'social_post' | 'image' | 'video' | 'ad_copy' | 'email'
  platform: text('platform'),             // 'instagram' | 'twitter' | 'linkedin' | 'tiktok' | 'facebook' | null
  title: text('title'),
  content: text('content').notNull(),
  mediaUrl: text('media_url'),
  mediaUrlsJson: text('media_urls_json'),
  metadataJson: text('metadata_json'),    // { topic, tone, cta, hashtags, weekGeneration, scheduledPostId }
  status: text('status').default('draft').notNull(),  // 'draft' | 'published' | 'archived'
  source: text('source').default('ai_generated').notNull(),  // 'ai_generated' | 'manual' | 'template'
  websiteContextJson: text('website_context_json'),  // snapshot of analyzed website data used to generate this
  generatedAt: text('generated_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  contentLibraryBrandProfileIdIdx: index('idx_content_library_brand_profile_id').on(table.brandProfileId),
  contentLibraryTypeIdx: index('idx_content_library_type').on(table.type),
  contentLibraryStatusIdx: index('idx_content_library_status').on(table.status),
  contentLibraryPlatformIdx: index('idx_content_library_platform').on(table.platform),
}));

export const installedPacks = sqliteTable('installed_packs', {
  id: text('id').primaryKey(),
  packId: text('pack_id').notNull(),
  packName: text('pack_name').notNull(),
  category: text('category').notNull(),
  brandProfileId: text('brand_profile_id').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  status: text('status').notNull().default('active'),
  installedAt: text('installed_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  installedPacksBrandProfileIdIdx: index('idx_installed_packs_brand_profile_id').on(table.brandProfileId),
  installedPacksPackIdIdx: index('idx_installed_packs_pack_id').on(table.packId),
}));
