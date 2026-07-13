import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radar,
  TrendingUp,
  Users,
  Zap,
  Plus,
  X,
  Sparkles,
  Loader2,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { socket } from '../lib/socket';
import { useUIStore } from '../stores/uiStore';
import api from '../lib/api';

interface TrendSignal {
  id: string;
  signalType: string;
  title: string;
  description: string;
  sourceUrl: string | null;
  relevanceScore: number;
  actionSuggestion: string;
  isActedOn: number;
  expiresAt: string;
  createdAt: string;
}

interface CompetitorProfile {
  id: string;
  brandProfileId: string;
  competitorName: string;
  platformHandle: string;
  platform: string;
  followersCount: number | null;
  lastCheckedAt: string | null;
  createdAt: string;
  latestSnapshot: {
    id: string;
    followersCount: number;
    postsThisWeek: number;
    topContentTheme: string;
    avgEngagementRate: number;
    snapshotDate: string;
  } | null;
}

type TabType = 'trends' | 'competitors' | 'opportunities';

const urgencyConfig: Record<string, { label: string; color: string }> = {
  post_today: { label: 'Post today', color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' },
  post_this_week: { label: 'This week', color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  monitor: { label: 'Monitor', color: 'bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
};

function getRelevanceColor(score: number): string {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getRelevanceBg(score: number): string {
  if (score >= 70) return 'bg-emerald-50 dark:bg-emerald-900/20';
  if (score >= 50) return 'bg-amber-50 dark:bg-amber-900/20';
  return 'bg-red-50 dark:bg-red-900/20';
}

function extractUrgency(description: string): { urgency: string; cleanDescription: string } {
  const urgencyMatch = description.match(/urgency:\s*(\w+)/i);
  const urgency = urgencyMatch ? urgencyMatch[1].toLowerCase() : 'post_this_week';
  const cleanDescription = description.replace(/urgency:\s*\w+\.?\s*/i, '').replace(/estimated reach:\s*\w+\.?\s*/i, '').trim();
  return { urgency, cleanDescription };
}

export default function IntelligencePage() {
  const navigate = useNavigate();
  const addNotification = useUIStore((s) => s.addNotification);
  const [activeTab, setActiveTab] = useState<TabType>('trends');
  const [signals, setSignals] = useState<TrendSignal[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(true);
  const [isLoadingCompetitors, setIsLoadingCompetitors] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Add competitor form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({
    competitorName: '',
    platformHandle: '',
    platform: 'instagram',
    brandProfileId: '',
  });

  const fetchSignals = useCallback(async (signalType?: string) => {
    try {
      const params: any = {};
      if (signalType) params.signalType = signalType;
      const res = await api.get('/api/intelligence/signals', { params });
      setSignals(res.data);
    } catch (err) {
      console.error('[Intelligence] Failed to fetch signals:', err);
    } finally {
      setIsLoadingSignals(false);
    }
  }, []);

  const fetchCompetitors = useCallback(async () => {
    try {
      const res = await api.get('/api/intelligence/competitors');
      setCompetitors(res.data);
    } catch (err) {
      console.error('[Intelligence] Failed to fetch competitors:', err);
    } finally {
      setIsLoadingCompetitors(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals(activeTab === 'opportunities' ? 'growth_opportunity' : undefined);
  }, [activeTab, fetchSignals]);

  useEffect(() => {
    if (activeTab === 'competitors') {
      fetchCompetitors();
    }
  }, [activeTab, fetchCompetitors]);

  // Socket listeners
  useEffect(() => {
    const handleNewTrends = (data: { count: number }) => {
      if (data.count > 0) {
        addNotification('info', 'New Trends Found', `${data.count} trending topics detected for your brand.`);
        if (activeTab === 'trends') {
          fetchSignals();
        }
      }
    };

    const handleCompetitorsAnalyzed = () => {
      if (activeTab === 'competitors') {
        fetchCompetitors();
      }
    };

    const handleOpportunitiesFound = (data: { count: number }) => {
      if (data.count > 0) {
        addNotification('info', 'Opportunities Found', `${data.count} growth opportunities identified.`);
        if (activeTab === 'opportunities') {
          fetchSignals('growth_opportunity');
        }
      }
    };

    socket.on('trends:new_signals', handleNewTrends);
    socket.on('competitors:analyzed', handleCompetitorsAnalyzed);
    socket.on('opportunities:found', handleOpportunitiesFound);

    return () => {
      socket.off('trends:new_signals', handleNewTrends);
      socket.off('competitors:analyzed', handleCompetitorsAnalyzed);
      socket.off('opportunities:found', handleOpportunitiesFound);
    };
  }, [activeTab, fetchSignals, fetchCompetitors, addNotification]);

  const handleCreateContent = async (signalId: string) => {
    setProcessingIds((prev) => new Set(prev).add(signalId));
    try {
      const res = await api.post(`/api/intelligence/signals/${signalId}/create-content`);
      const { contentBrief } = res.data;
      // Navigate to Content Studio with pre-filled topic
      navigate(`/content?topic=${encodeURIComponent(contentBrief.topic)}&context=${encodeURIComponent(contentBrief.additionalContext)}`);
      addNotification('success', 'Signal Activated', 'Content brief created. Navigate to Content Studio to create your post.');
    } catch (err: any) {
      addNotification('error', 'Failed', err?.response?.data?.message || 'Could not process signal.');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(signalId);
        return next;
      });
    }
  };

  const handleAddCompetitor = async () => {
    if (!newCompetitor.competitorName || !newCompetitor.platformHandle) return;
    try {
      await api.post('/api/intelligence/competitors', newCompetitor);
      setShowAddForm(false);
      setNewCompetitor({ competitorName: '', platformHandle: '', platform: 'instagram', brandProfileId: '' });
      fetchCompetitors();
      addNotification('success', 'Competitor Added', `Now tracking ${newCompetitor.competitorName}.`);
    } catch (err: any) {
      addNotification('error', 'Failed', err?.response?.data?.message || 'Could not add competitor.');
    }
  };

  const handleDeleteCompetitor = async (id: string) => {
    try {
      await api.delete(`/api/intelligence/competitors/${id}`);
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
      addNotification('info', 'Competitor Removed', 'Competitor profile deleted.');
    } catch (err: any) {
      addNotification('error', 'Failed', err?.response?.data?.message || 'Could not delete competitor.');
    }
  };

  const tabs: { key: TabType; label: string; icon: any }[] = [
    { key: 'trends', label: 'Trends', icon: TrendingUp },
    { key: 'competitors', label: 'Competitors', icon: Users },
    { key: 'opportunities', label: 'Opportunities', icon: Zap },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 relative animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 shadow-sm">
            <Radar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Intelligence</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              AI-powered market intelligence and competitor insights
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          {isLoadingSignals ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-indigo-50 p-4 dark:bg-indigo-900/20">
                <TrendingUp className="h-8 w-8 text-indigo-500 dark:text-indigo-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">No trends detected yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                VIMO's Trend Hunter runs every 4 hours to discover trending topics relevant to your brand.
              </p>
            </div>
          ) : (
            signals.map((signal) => (
              <div
                key={signal.id}
                className="group rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-indigo-200/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/50 animate-in slide-in-from-right-2 duration-300"
              >
                <div className="flex items-start gap-4">
                  {/* Relevance Score */}
                  <div className={`shrink-0 flex flex-col items-center rounded-xl px-3 py-2 ${getRelevanceBg(signal.relevanceScore)}`}>
                    <span className={`text-2xl font-black ${getRelevanceColor(signal.relevanceScore)}`}>
                      {signal.relevanceScore}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Score</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {signal.title}
                      </h3>
                      <span className="shrink-0 text-[10px] font-medium text-slate-400">
                        {formatDistanceToNow(parseISO(signal.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                      {signal.description}
                    </p>
                    <div className="flex items-center gap-3">
                      {(() => {
                        const { urgency } = extractUrgency(signal.actionSuggestion || '');
                        const conf = urgencyConfig[urgency] || urgencyConfig.post_this_week;
                        return (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${conf.color}`}>
                            <Clock className="h-3 w-3" />
                            {conf.label}
                          </span>
                        );
                      })()}
                      <button
                        onClick={() => handleCreateContent(signal.id)}
                        disabled={processingIds.has(signal.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingIds.has(signal.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Create content
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'competitors' && (
        <div className="space-y-4">
          {/* Add competitor button / form */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-all w-full dark:border-slate-700 dark:hover:border-indigo-600"
            >
              <Plus className="h-4 w-4" />
              Add competitor
            </button>
          ) : (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3 dark:border-indigo-800 dark:bg-indigo-900/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider dark:text-indigo-400">New Competitor</span>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-indigo-500 hover:text-indigo-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Competitor name"
                  value={newCompetitor.competitorName}
                  onChange={(e) => setNewCompetitor((prev) => ({ ...prev, competitorName: e.target.value }))}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm dark:border-indigo-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <input
                  type="text"
                  placeholder="Instagram handle (without @)"
                  value={newCompetitor.platformHandle}
                  onChange={(e) => setNewCompetitor((prev) => ({ ...prev, platformHandle: e.target.value }))}
                  className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm dark:border-indigo-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <button
                  onClick={handleAddCompetitor}
                  disabled={!newCompetitor.competitorName || !newCompetitor.platformHandle}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  Start Tracking
                </button>
              </div>
            </div>
          )}

          {isLoadingCompetitors ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : competitors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-indigo-50 p-4 dark:bg-indigo-900/20">
                <Users className="h-8 w-8 text-indigo-500 dark:text-indigo-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">No competitors tracked yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                Add a competitor's Instagram handle to start monitoring them.
              </p>
            </div>
          ) : (
            competitors.map((competitor) => (
              <div
                key={competitor.id}
                className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm hover:border-indigo-200/50 hover:shadow-md transition-all dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/50"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-indigo-50 p-2 dark:bg-indigo-900/30">
                      <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{competitor.competitorName}</h3>
                      <p className="text-xs text-slate-500">@{competitor.platformHandle} on {competitor.platform}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCompetitor(competitor.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {competitor.latestSnapshot ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Followers</span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                        {competitor.followersCount?.toLocaleString() || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Posts/Week</span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                        {competitor.latestSnapshot.postsThisWeek}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top Theme</span>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-1">
                        {competitor.latestSnapshot.topContentTheme}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top Content Theme</span>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {competitor.latestSnapshot.topContentTheme}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Awaiting first analysis (runs daily at 7am)</p>
                )}

                {competitor.lastCheckedAt && (
                  <p className="mt-3 text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last checked {formatDistanceToNow(parseISO(competitor.lastCheckedAt), { addSuffix: true })}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'opportunities' && (
        <div className="space-y-4">
          {isLoadingSignals ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-indigo-50 p-4 dark:bg-indigo-900/20">
                <Zap className="h-8 w-8 text-indigo-500 dark:text-indigo-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">No opportunities found yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                VIMO scans Product Hunt and GitHub every 12 hours for growth opportunities.
              </p>
            </div>
          ) : (
            signals.map((signal) => {
              const { urgency, cleanDescription } = extractUrgency(signal.actionSuggestion || '');
              const urgencyConf = urgencyConfig[urgency] || urgencyConfig.post_this_week;
              const reachMatch = (signal.actionSuggestion || '').match(/estimated reach:\s*(\w+)/i);
              const estimatedReach = reachMatch ? reachMatch[1].toLowerCase() : '';
              const reachColors: Record<string, string> = {
                low: 'bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-700',
                medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
              };
              const reachColor = reachColors[estimatedReach] || reachColors.medium;

              return (
                <div
                  key={signal.id}
                  className="group rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-indigo-200/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/50 animate-in slide-in-from-right-2 duration-300"
                >
                  <div className="flex items-start gap-4">
                    {/* Relevance Score */}
                    <div className={`shrink-0 flex flex-col items-center rounded-xl px-3 py-2 ${getRelevanceBg(signal.relevanceScore)}`}>
                      <span className={`text-2xl font-black ${getRelevanceColor(signal.relevanceScore)}`}>
                        {signal.relevanceScore}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Score</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {signal.title}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                        {cleanDescription || signal.description}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${urgencyConf.color}`}>
                          <Clock className="h-3 w-3" />
                          {urgencyConf.label}
                        </span>
                        {estimatedReach && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${reachColor}`}>
                            {estimatedReach === 'high' ? '🔥' : estimatedReach === 'medium' ? '📈' : '📊'} {estimatedReach}
                          </span>
                        )}
                        <button
                          onClick={() => handleCreateContent(signal.id)}
                          disabled={processingIds.has(signal.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingIds.has(signal.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          Create content
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
