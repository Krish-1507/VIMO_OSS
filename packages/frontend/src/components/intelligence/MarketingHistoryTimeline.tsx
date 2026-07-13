import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  History,
  MessageSquare,
  TrendingUp,
  Users,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import api from '../../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface MemoryEntry {
  id: string;
  entryType: string;
  entryDate: string;
  weekLabel: string;
  summary: string;
  metrics: Record<string, unknown> | null;
  sentiment: string;
  tags: string[] | null;
  linkedEntityId: string | null;
  linkedEntityType: string | null;
}

interface WeeklyGroup {
  weekLabel: string;
  startDate: string;
  entries: MemoryEntry[];
  weekSummary: string;
  netFollowerChange: number;
  avgEngagementRate: number;
  postCount: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const entryColors: Record<string, string> = {
  post_published: 'bg-teal-500',
  campaign_started: 'bg-purple-500',
  campaign_completed: 'bg-purple-500',
  follower_milestone: 'bg-amber-500',
  engagement_spike: 'bg-rose-500',
  trend_capitalized: 'bg-amber-500',
  lesson_learned: 'bg-blue-500',
  strategy_shift: 'bg-indigo-500',
  director_insight: 'bg-indigo-500',
};

const entryColorDot: Record<string, string> = {
  post_published: 'border-teal-500 bg-teal-100 dark:bg-teal-900/30',
  campaign_started: 'border-purple-500 bg-purple-100 dark:bg-purple-900/30',
  campaign_completed: 'border-purple-500 bg-purple-100 dark:bg-purple-900/30',
  follower_milestone: 'border-amber-500 bg-amber-100 dark:bg-amber-900/30',
  engagement_spike: 'border-rose-500 bg-rose-100 dark:bg-rose-900/30',
  trend_capitalized: 'border-amber-500 bg-amber-100 dark:bg-amber-900/30',
  lesson_learned: 'border-blue-500 bg-blue-100 dark:bg-blue-900/30',
  strategy_shift: 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/30',
  director_insight: 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/30',
};

function getEntryTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    post_published: 'Post Published',
    campaign_started: 'Campaign Started',
    campaign_completed: 'Campaign Completed',
    follower_milestone: 'Follower Milestone',
    engagement_spike: 'Engagement Spike',
    trend_capitalized: 'Trend Capitalized',
    lesson_learned: 'Lesson Learned',
    strategy_shift: 'Strategy Shift',
    director_insight: 'Director Insight',
  };
  return labels[type] || type;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function MarketingHistoryTimeline({ selectedBrandId }: { selectedBrandId: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeeklyGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<MemoryEntry | null>(null);
  const [question, setQuestion] = useState('');
  const [insight, setInsight] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    if (isExpanded && selectedBrandId) {
      fetchTimeline();
    }
  }, [isExpanded, selectedBrandId]);

  const fetchTimeline = async () => {
    if (!selectedBrandId) return;
    setIsLoading(true);
    try {
      const res = await api.get('/api/memory/weekly', {
        params: { brandProfileId: selectedBrandId, weeksBack: 12 },
      });
      setWeeklyData(res.data.weekly || []);
    } catch (err) {
      console.error('Failed to fetch memory timeline', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAsk = async () => {
    if (!selectedBrandId || !question.trim()) return;
    setIsAsking(true);
    try {
      const res = await api.post('/api/memory/insight', {
        brandProfileId: selectedBrandId,
        question: question.trim(),
      });
      setInsight(res.data.insight);
    } catch (err) {
      setInsight('Failed to generate insight. Please try again.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2 dark:bg-indigo-900/20">
            <History className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Marketing History</h2>
            <p className="text-xs text-slate-500">Your brand's complete chronological record</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-4 sm:p-6 dark:border-slate-800">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : weeklyData.length === 0 ? (
            <div className="py-12 text-center">
              <History className="mx-auto h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-500">No marketing history yet. Publish content and run campaigns to build your timeline.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {weeklyData.map((week, wi) => (
                <div key={wi} className="relative">
                  {/* Week Header */}
                  <div className="flex items-center gap-4 mb-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{week.weekLabel}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        <span className={week.netFollowerChange > 0 ? 'text-emerald-600' : week.netFollowerChange < 0 ? 'text-red-600' : ''}>
                          {week.netFollowerChange > 0 ? '+' : ''}{week.netFollowerChange}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {week.avgEngagementRate}%
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {week.postCount} posts
                      </span>
                    </div>
                  </div>

                  {/* Timeline Entries */}
                  <div className="space-y-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                    {week.entries.length === 0 ? (
                      <div className="pl-4 py-2 text-xs text-slate-400 italic">
                        No events recorded this week
                      </div>
                    ) : (
                      week.entries.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => setSelectedEntry(entry)}
                          className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm ${
                            entryColorDot[entry.entryType] || 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                          } ${
                            entry.sentiment === 'positive'
                              ? 'bg-emerald-50/30 dark:bg-emerald-900/10'
                              : entry.sentiment === 'negative'
                              ? 'bg-red-50/30 dark:bg-red-900/10'
                              : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 bg-white"
                              style={{
                                borderColor: entryColors[entry.entryType] ? entryColors[entry.entryType].replace('bg-', '').replace('-500', '') : '#94a3b8',
                                backgroundColor: entryColors[entry.entryType]?.replace('bg-', '').replace('-500', '500') || '#f1f5f9',
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  {getEntryTypeLabel(entry.entryType)}
                                </span>
                                <span className={`text-[10px] font-medium capitalize ${
                                  entry.sentiment === 'positive' ? 'text-emerald-600' :
                                  entry.sentiment === 'negative' ? 'text-red-600' :
                                  'text-slate-400'
                                }`}>
                                  {entry.sentiment}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300">{entry.summary}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  {/* Week Summary */}
                  <div className="mt-2 pl-4 text-xs text-slate-400 italic">
                    {week.weekSummary}
                  </div>
                </div>
              ))}

              {/* Ask about your history */}
              <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ask about your history</h3>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. What happened to my engagement recently?"
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={isAsking || !question.trim()}
                    className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAsking ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Ask'}
                  </button>
                </div>
                {insight && (
                  <div className="mt-3 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900 dark:bg-indigo-900/20 dark:text-indigo-200">
                    {insight}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800 max-w-md mx-4 w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {getEntryTypeLabel(selectedEntry.entryType)}
              </h3>
              <button onClick={() => setSelectedEntry(null)} className="text-slate-400 hover:text-slate-500">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{selectedEntry.summary}</p>
            {selectedEntry.metrics && Object.keys(selectedEntry.metrics).length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">Metrics</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selectedEntry.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
                      <p className="text-[10px] font-medium text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedEntry.tags && selectedEntry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedEntry.tags.map((tag, i) => (
                  <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 text-xs text-slate-400">
              {new Date(selectedEntry.entryDate).toLocaleString()}
              {selectedEntry.linkedEntityType && ` · ${selectedEntry.linkedEntityType}: ${selectedEntry.linkedEntityId?.substring(0, 8)}...`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
