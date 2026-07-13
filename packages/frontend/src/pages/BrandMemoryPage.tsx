import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  FileText,
  Target,
  TrendingUp,
  RefreshCw,
  Loader2,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  Hash,
  MessageCircle,
  Users,
  Sparkles,
  Power,
  CheckCircle2,
  Circle,
  Network,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useUIStore } from '../stores/uiStore';
import api from '../lib/api';

interface PerformanceLesson {
  id: string;
  learnedAt: string;
  lesson: string;
  contentType: string;
  platform: string;
  engagementRate: number;
  whatWorked: string;
  whatToAvoidInFuture: string;
}

interface AudienceInsight {
  id: string;
  discoveredAt: string;
  segment: string;
  contentTheyEngageWith: string;
  bestTimeToReach: string;
  estimatedSize: string;
}

interface CampaignMemory {
  campaignId: string;
  completedAt: string;
  goalType: string;
  totalPosts: number;
  avgEngagementRate: number;
  topPerformingContentType: string;
  lessonsLearned: string;
  followerGrowth: number;
}

interface ContentDNA {
  strongestHooks: string[];
  avoidTheseFormats: string[];
  bestPerformingTopics: string[];
  brandVoiceEvolution: string;
  lastUpdated: string;
}

interface BehaviorRule {
  ruleId: string;
  condition: {
    metric: string;
    comparison: string;
    threshold: number;
    contentType?: string;
    platform?: string;
  };
  effect: {
    targetSystem: string;
    adjustment: string;
    magnitude: 'increase' | 'decrease' | 'stop' | 'start';
    parameter: string;
    newValue: unknown;
  };
  confidence: number;
  basedOnPostCount: number;
  learnedAt: string;
  isActive: boolean;
}

interface AdaptivePlan {
  brandProfileId: string;
  rules: BehaviorRule[];
  lastUpdated: string;
  version: number;
}

interface KnowledgeEntityRef {
  id: string;
  type: string;
  label: string;
}

interface KnowledgeRelationshipRow {
  id: string;
  relationshipType: string;
  strength: number;
  sampleSize: number;
  lastObserved: string;
  from: KnowledgeEntityRef;
  to: KnowledgeEntityRef;
}

interface BrandMemoryData {
  id: string;
  name: string;
  industry: string;
  audience: string;
  memoryVersion: number;
  totalPostsGenerated: number;
  totalCampaignsRun: number;
  performanceLessons: PerformanceLesson[] | null;
  audienceInsights: AudienceInsight[] | null;
  campaignMemory: CampaignMemory[] | null;
  contentDNA: ContentDNA | null;
  adaptivePlan: AdaptivePlan | null;
  voiceFingerprint: any;
  updatedAt: string;
}

function ContentTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    educational: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    promotional: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    engagement: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    storytelling: 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 border-pink-200 dark:border-pink-800',
    social_proof: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200 dark:border-teal-800',
  };
  const defaultColor = 'bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-800';
  const color = colors[type] || defaultColor;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${color}`}>
      {type}
    </span>
  );
}

function ruleToPlainEnglish(rule: BehaviorRule): string {
  const { condition, effect } = rule;
  const ct = condition.contentType || 'this content type';
  const platform = condition.platform;
  const param = effect.parameter || '';
  const threshold = condition.threshold;
  const overall = threshold > 0 ? threshold.toFixed(1) : '0';

  if (effect.magnitude === 'stop') {
    return `Avoiding ${ct}${platform ? ` on ${platform}` : ''} because it consistently underperforms.`;
  }

  if (effect.magnitude === 'decrease') {
    if (param.startsWith('hashtag')) {
      return `Using fewer hashtags because your data shows posts with fewer hashtags reach more people.`;
    }
    if (param.startsWith('postingTime')) {
      return `Scheduling less often at ${param.replace('postingTime.', '')} because engagement there is below average.`;
    }
    return `Posting less ${ct}${platform ? ` on ${platform}` : ''} because its ${overall}% engagement is below average.`;
  }

  if (effect.magnitude === 'start') {
    return `Starting to use ${ct}${platform ? ` on ${platform}` : ''} because your data supports it.`;
  }

  // increase
  if (param.startsWith('hashtag')) {
    return `Using more hashtags because your top-performing posts use more.`;
  }
  if (param.startsWith('postingTime')) {
    return `Scheduling more posts at ${param.replace('postingTime.', '')} because engagement there is ${overall}% above average.`;
  }
  return `Posting more ${ct}${platform ? ` on ${platform}` : ''} because it gets ${overall}% engagement (your average is below that).`;
}

function prettyEntityType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function prettyRelationship(type: string): string {
  switch (type) {
    case 'performs_well_with': return 'performs well with';
    case 'performs_poorly_with': return 'performs poorly with';
    case 'resonates_with': return 'resonates with';
    case 'best_time_for': return 'is best time for';
    case 'drives': return 'drives';
    case 'correlates_with': return 'correlates with';
    default: return type.replace(/_/g, ' ');
  }
}

export default function BrandMemoryPage() {
  const addNotification = useUIStore((s) => s.addNotification);
  const [data, setData] = useState<BrandMemoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingPlan, setIsRefreshingPlan] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [brandProfileId, setBrandProfileId] = useState<string>('');
  const [shouldRender, setShouldRender] = useState(false);
  const [kgRelationships, setKgRelationships] = useState<KnowledgeRelationshipRow[]>([]);
  const [isKgLoading, setIsKgLoading] = useState(false);
  const [isRebuildingKg, setIsRebuildingKg] = useState(false);

  const fetchMemory = useCallback(async (bpId: string) => {
    try {
      const res = await api.get(`/api/brand-memory/${bpId}`);
      setData(res.data);
    } catch (err) {
      console.error('[BrandMemory] Failed to fetch:', err);
      // Try to get brand profile ID from settings
      try {
        const settingsRes = await api.get('/api/settings');
        const defaultId = settingsRes.data?.defaultBrandId;
        if (defaultId && defaultId !== bpId) {
          setBrandProfileId(defaultId);
          return fetchMemory(defaultId);
        }
      } catch {}
    } finally {
      setIsLoading(false);
      setShouldRender(true);
    }
  }, []);

  const fetchKnowledgeGraph = useCallback(async (bpId: string) => {
    setIsKgLoading(true);
    try {
      const res = await api.get(`/api/knowledge-graph/relationships`, {
        params: { brandProfileId: bpId, limit: 20 },
      });
      setKgRelationships(res.data?.relationships || []);
    } catch (err) {
      console.warn('[BrandMemory] Knowledge graph fetch failed:', err);
      setKgRelationships([]);
    } finally {
      setIsKgLoading(false);
    }
  }, []);

  useEffect(() => {
    // Try to find the first brand profile
    const load = async () => {
      try {
        const settingsRes = await api.get('/api/settings');
        const defaultId = settingsRes.data?.defaultBrandId;
        if (defaultId) {
          setBrandProfileId(defaultId);
          fetchMemory(defaultId);
          fetchKnowledgeGraph(defaultId);
          return;
        }
      } catch {}
      // Try getting brand profiles directly
      try {
        const bpRes = await api.get('/api/brand-profiles');
        if (bpRes.data?.length > 0) {
          const id = bpRes.data[0].id;
          setBrandProfileId(id);
          fetchMemory(id);
          fetchKnowledgeGraph(id);
          return;
        }
      } catch {}
      setIsLoading(false);
    };
    load();
  }, [fetchMemory, fetchKnowledgeGraph]);

  const handleRefreshDNA = async () => {
    if (!brandProfileId) return;
    setIsRefreshing(true);
    try {
      await api.post(`/api/brand-memory/${brandProfileId}/refresh-dna`);
      addNotification('success', 'DNA Refreshed', 'Content DNA has been regenerated from performance data.');
      fetchMemory(brandProfileId);
    } catch (err: any) {
      addNotification('error', 'Refresh Failed', err?.response?.data?.message || 'Could not refresh DNA.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshAdaptivePlan = async () => {
    if (!brandProfileId) return;
    setIsRefreshingPlan(true);
    try {
      await api.post(`/api/brand-memory/${brandProfileId}/adaptive-plan/refresh`);
      addNotification('success', 'Plan Refreshed', 'Adaptive plan has been regenerated from your performance lessons.');
      fetchMemory(brandProfileId);
      // Give the background knowledge-graph rebuild a moment, then refresh
      setTimeout(() => fetchKnowledgeGraph(brandProfileId), 1500);
    } catch (err: any) {
      addNotification('error', 'Refresh Failed', err?.response?.data?.message || 'Could not refresh adaptive plan.');
    } finally {
      setIsRefreshingPlan(false);
    }
  };

  const handleRebuildKnowledgeGraph = async () => {
    if (!brandProfileId) return;
    setIsRebuildingKg(true);
    try {
      await api.post('/api/knowledge-graph/rebuild', { brandProfileId });
      addNotification('success', 'Rebuild started', 'Re-deriving the knowledge graph from your published posts.');
      // Wait a bit and then refetch
      setTimeout(async () => {
        await fetchKnowledgeGraph(brandProfileId);
        setIsRebuildingKg(false);
        addNotification('success', 'Graph rebuilt', 'Knowledge graph is up to date with the latest data.');
      }, 3000);
    } catch (err: any) {
      addNotification('error', 'Rebuild Failed', err?.response?.data?.message || 'Could not rebuild the knowledge graph.');
      setIsRebuildingKg(false);
    }
  };

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    if (!brandProfileId) return;
    setTogglingRuleId(ruleId);
    try {
      await api.post(`/api/brand-memory/${brandProfileId}/adaptive-plan/toggle-rule`, {
        ruleId,
        isActive,
      });
      // Update local state without a full refetch
      setData((prev) => {
        if (!prev || !prev.adaptivePlan) return prev;
        return {
          ...prev,
          adaptivePlan: {
            ...prev.adaptivePlan,
            rules: prev.adaptivePlan.rules.map((r) =>
              r.ruleId === ruleId ? { ...r, isActive } : r
            ),
          },
        };
      });
      addNotification(
        'success',
        isActive ? 'Rule Enabled' : 'Rule Disabled',
        isActive ? 'This rule will start influencing your content again.' : 'This rule will no longer influence your content.'
      );
    } catch (err: any) {
      addNotification('error', 'Toggle Failed', err?.response?.data?.message || 'Could not update rule.');
    } finally {
      setTogglingRuleId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Brain className="h-12 w-12 animate-pulse text-purple-500" />
          <p className="text-sm font-medium text-slate-500">Loading brand memory...</p>
        </div>
      </div>
    );
  }

  if (!shouldRender || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Brain className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Brand Memory Not Available</h2>
        <p className="text-sm text-slate-500 mt-2">Set up a brand profile to see your brand's memory.</p>
      </div>
    );
  }

  const lessons = data.performanceLessons || [];
  const insights = data.audienceInsights || [];
  const dna = data.contentDNA;
  const adaptivePlan = data.adaptivePlan;
  const activeRules = adaptivePlan?.rules?.filter((r) => r.isActive) || [];
  const inactiveRules = adaptivePlan?.rules?.filter((r) => !r.isActive) || [];

  // Show only the top 5 strongest relationships in the Brand Memory page;
  // the full list is available via the API.
  const topRelationships = kgRelationships.slice(0, 5);
  const avgStrength =
    kgRelationships.length > 0
      ? kgRelationships.reduce((s, r) => s + r.strength, 0) / kgRelationships.length
      : 0;

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 relative animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 p-2.5 shadow-sm">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Brand Memory</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {data.name} — Learning from {data.totalPostsGenerated} posts and {data.totalCampaignsRun} campaigns
              {data.updatedAt && <span className="ml-2 text-[10px] text-slate-400">· Last updated {formatDistanceToNow(parseISO(data.updatedAt), { addSuffix: true })}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshAdaptivePlan}
            disabled={isRefreshingPlan}
            className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100 transition-all active:scale-95 disabled:opacity-50 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/50"
          >
            {isRefreshingPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Refresh plan
          </button>
          <button
            onClick={handleRefreshDNA}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh DNA
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-purple-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Posts</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{data.totalPostsGenerated}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-indigo-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Campaigns</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{data.totalCampaignsRun}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lessons</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{lessons.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Insights</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{insights.length}</p>
        </div>
      </div>

      {/* Content DNA */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Content DNA</h2>
        {dna ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/30 dark:bg-emerald-900/10">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsUp className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider dark:text-emerald-400">Hooks that work</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {dna.strongestHooks.map((hook, i) => (
                  <span key={i} className="inline-flex items-center rounded-full bg-emerald-200/60 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-800/30 dark:text-emerald-300">
                    {hook}
                  </span>
                ))}
                {dna.strongestHooks.length === 0 && <span className="text-xs text-slate-400 italic">Not yet determined</span>}
              </div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsDown className="h-4 w-4 text-red-600" />
                <span className="text-xs font-bold text-red-700 uppercase tracking-wider dark:text-red-400">Formats to avoid</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {dna.avoidTheseFormats.map((fmt, i) => (
                  <span key={i} className="inline-flex items-center rounded-full bg-red-200/60 px-3 py-1 text-xs font-semibold text-red-800 dark:bg-red-800/30 dark:text-red-300">
                    {fmt}
                  </span>
                ))}
                {dna.avoidTheseFormats.length === 0 && <span className="text-xs text-slate-400 italic">None identified</span>}
              </div>
            </div>
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/30 dark:bg-teal-900/10">
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-bold text-teal-700 uppercase tracking-wider dark:text-teal-400">Best topics</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {dna.bestPerformingTopics.map((topic, i) => (
                  <span key={i} className="inline-flex items-center rounded-full bg-teal-200/60 px-3 py-1 text-xs font-semibold text-teal-800 dark:bg-teal-800/30 dark:text-teal-300">
                    {topic}
                  </span>
                ))}
                {dna.bestPerformingTopics.length === 0 && <span className="text-xs text-slate-400 italic">Not yet determined</span>}
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/30 dark:bg-indigo-900/10">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider dark:text-indigo-400">Voice evolution</span>
              </div>
              <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed">
                {dna.brandVoiceEvolution || 'Still being learned.'}
              </p>
              {dna.lastUpdated && (
                <p className="mt-2 text-[10px] text-indigo-500/70">
                  Last updated {formatDistanceToNow(parseISO(dna.lastUpdated), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 italic">Content DNA not yet generated. Publish some posts and run a campaign first.</p>
          </div>
        )}
      </div>

      {/* How VIMO is adapting */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">How VIMO is adapting</h2>
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
              {activeRules.length} active
            </span>
          </div>
        </div>

        {(!adaptivePlan || adaptivePlan.rules.length === 0) ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">
              No adaptive rules yet. VIMO derives a fresh plan automatically after every 10 performance lessons.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              You can also click <strong>Refresh plan</strong> above to derive one right now.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeRules.map((rule) => (
              <div
                key={rule.ruleId}
                className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50/40 p-4 shadow-sm dark:border-teal-900/40 dark:from-teal-950/30 dark:to-emerald-950/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                        {ruleToPlainEnglish(rule)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <span className="font-semibold">{rule.basedOnPostCount}</span> posts
                        </span>
                        <span className="inline-flex items-center gap-1">
                          Confidence:
                          <span className="font-semibold text-teal-700 dark:text-teal-300">
                            {Math.round(rule.confidence * 100)}%
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 capitalize">
                          <ContentTypeBadge type={rule.effect.magnitude} />
                          <span className="text-[10px]">{rule.effect.targetSystem.replace('_', ' ')}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleRule(rule.ruleId, false)}
                    disabled={togglingRuleId === rule.ruleId}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-teal-300 bg-white/70 px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:bg-slate-900/50 dark:text-teal-300 dark:hover:bg-teal-900/40 disabled:opacity-50"
                    title="Disable this rule"
                  >
                    {togglingRuleId === rule.ruleId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Power className="h-3 w-3" />
                    )}
                    Active
                  </button>
                </div>
              </div>
            ))}

            {inactiveRules.length > 0 && (
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  {inactiveRules.length} disabled rule{inactiveRules.length === 1 ? '' : 's'} — click to view
                </summary>
                <div className="mt-3 space-y-2">
                  {inactiveRules.map((rule) => (
                    <div
                      key={rule.ruleId}
                      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {ruleToPlainEnglish(rule)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleRule(rule.ruleId, true)}
                          disabled={togglingRuleId === rule.ruleId}
                          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                          {togglingRuleId === rule.ruleId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Power className="h-3 w-3" />
                          )}
                          Re-enable
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* What VIMO knows */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">What VIMO knows</h2>
            {kgRelationships.length > 0 && (
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                {kgRelationships.length} relationship{kgRelationships.length === 1 ? '' : 's'}
              </span>
            )}
            {kgRelationships.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Graph confidence: {Math.round(avgStrength * 100)}%
              </span>
            )}
          </div>
          <button
            onClick={handleRebuildKnowledgeGraph}
            disabled={isRebuildingKg}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-700 hover:bg-cyan-100 transition-all active:scale-95 disabled:opacity-50 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300 dark:hover:bg-cyan-900/50"
            title="Rebuild the knowledge graph from your published posts"
          >
            {isRebuildingKg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Rebuild graph
          </button>
        </div>

        {isKgLoading ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-cyan-500" />
            <p className="text-sm text-slate-500">Loading relationships...</p>
          </div>
        ) : kgRelationships.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
            <Network className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">
              No relationships yet. VIMO discovers patterns once you have published posts with metrics.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              You can also click <strong>Rebuild graph</strong> above to derive relationships from existing posts.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topRelationships.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm dark:border-cyan-900/40 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                    {prettyEntityType(r.from.type)}
                  </span>
                  <strong className="text-slate-900 dark:text-white">{r.from.label}</strong>
                  <span className="text-xs text-slate-400 italic">
                    {prettyRelationship(r.relationshipType)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {prettyEntityType(r.to.type)}
                  </span>
                  <strong className="text-slate-900 dark:text-white">{r.to.label}</strong>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-500"
                      style={{ width: `${Math.round(r.strength * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300 w-12 text-right">
                    {Math.round(r.strength * 100)}%
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {r.sampleSize} post{r.sampleSize === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            ))}
            {kgRelationships.length > topRelationships.length && (
              <p className="text-center text-[11px] text-slate-400 pt-1">
                Showing top {topRelationships.length} of {kgRelationships.length} relationships.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Performance Lessons */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Performance Lessons</h2>
        {lessons.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 italic">No lessons recorded yet. Publish posts to start building performance memory.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {lessons.slice(-20).reverse().map((lesson) => (
              <div
                key={lesson.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <ContentTypeBadge type={lesson.contentType} />
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {lesson.engagementRate}%
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">
                      {formatDistanceToNow(parseISO(lesson.learnedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{lesson.whatWorked}</p>
                {lesson.whatToAvoidInFuture && (
                  <p className="text-xs text-red-500 mt-1">⚠ {lesson.whatToAvoidInFuture}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audience Insights */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Audience Insights</h2>
        {insights.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 italic">No audience insights collected yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {insights.slice(-20).reverse().map((insight) => (
              <div
                key={insight.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-full bg-purple-50 p-1.5 dark:bg-purple-900/30">
                    <Users className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-xs font-bold text-purple-700 uppercase dark:text-purple-400">{insight.segment}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{insight.contentTheyEngageWith}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>⏰ {insight.bestTimeToReach}</span>
                  <span>👥 {insight.estimatedSize}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
