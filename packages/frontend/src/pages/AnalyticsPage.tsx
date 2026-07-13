import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Megaphone,
  Clock,
  Target,
  TrendingUp,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import MarketingTimeMachine from '../components/intelligence/MarketingTimeMachine';
import MarketingHistoryTimeline from '../components/intelligence/MarketingHistoryTimeline';
import { useBrandStore } from '../stores/brandStore';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface PostPerformanceData {
  totalPostsPublished: number;
  totalReach: number;
  totalEngagements: number;
  avgEngagementRate: number;
  byPlatform: Record<string, { posts: number; reach: number; engagements: number; topPost: string }>;
  byDayOfWeek: number[];
  byHourOfDay: number[];
  byDate: Record<string, number>;
}

interface UpcomingPost {
  id: string;
  platform: string;
  content: string;
  scheduledAt: string;
  status: string;
  metadataJson?: string;
}

interface WeeklyReport {
  summary: string;
  highlights: string[];
  recommendations: string[];
  data: PostPerformanceData;
}

interface PostWithMetrics {
  id: string;
  platform: string;
  content: string;
  scheduledAt: string;
  status: string;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  engagementRate: number;
}

export default function AnalyticsPage() {
  const { profiles: brandProfiles, selectedId: selectedBrandId, setSelectedId: setSelectedBrandId, fetchProfiles: fetchBrandProfiles } = useBrandStore();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('7');

  const [performance, setPerformance] = useState<PostPerformanceData | null>(null);
  const [prevPerformance, setPrevPerformance] = useState<PostPerformanceData | null>(null);
  const [upcomingPosts, setUpcomingPosts] = useState<UpcomingPost[]>([]);
  const [postsWithMetrics, setPostsWithMetrics] = useState<PostWithMetrics[]>([]);

  const [weeklyBrief, setWeeklyBrief] = useState<string | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);

  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<{
    totalFollowers: number;
    hasConnectedAccounts: boolean;
    connectedPlatforms: string[];
    platforms: { platform: string; connected: boolean; followers: number; reason?: string }[];
    dataIntegrity: { realFollowers: boolean; note: string };
  } | null>(null);

  useEffect(() => { fetchBrandProfiles(); }, [fetchBrandProfiles]);

  const fetchData = async () => {
    if (!selectedBrandId) return;
    setIsLoading(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const end = new Date();
      const start = subDays(end, parseInt(dateRange, 10));

      const [perfRes, upcomingRes, summaryRes] = await Promise.all([
        axios.get(`${API_BASE}/api/analytics/performance`, {
          params: { startDate: start.toISOString(), endDate: end.toISOString(), brandProfileId: selectedBrandId },
          headers: { 'x-session-token': token },
        }),
        axios.get(`${API_BASE}/api/analytics/upcoming`, {
          params: { brandProfileId: selectedBrandId },
          headers: { 'x-session-token': token },
        }),
        axios.get(`${API_BASE}/api/analytics/summary`, {
          params: { brandProfileId: selectedBrandId },
          headers: { 'x-session-token': token },
        }).catch(() => null),
      ]);

      setPerformance(perfRes.data);
      setUpcomingPosts(upcomingRes.data);
      if (summaryRes && summaryRes.data) setSummary(summaryRes.data);

      // Previous period
      const periodLength = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - periodLength);
      const prevPerfRes = await axios.get(`${API_BASE}/api/analytics/performance`, {
        params: { startDate: prevStart.toISOString(), endDate: prevEnd.toISOString(), brandProfileId: selectedBrandId },
        headers: { 'x-session-token': token },
      });
      setPrevPerformance(prevPerfRes.data);

      // Build postsWithMetrics from scheduled posts
      try {
        const postsRes = await axios.get(`${API_BASE}/api/scheduled-posts`, {
          params: { brandProfileId: selectedBrandId, status: 'published' },
          headers: { 'x-session-token': token },
        });
        const allPosts = Array.isArray(postsRes.data) ? postsRes.data : [];
        const recentPosts = allPosts.filter((p: UpcomingPost) => {
          const d = new Date(p.scheduledAt);
          return d >= start && d <= end;
        });

        const postsMetrics: PostWithMetrics[] = recentPosts.map((p: UpcomingPost) => {
          const metadata = p.metadataJson ? JSON.parse(p.metadataJson) : {};
          const perf = metadata.performance || {};
          // Use real performance data from connected platforms
          // If no data yet, show 0 (will update when platforms sync)
          const reach = perf.reach ?? 0;
          const likes = perf.likes ?? 0;
          const comments = perf.comments ?? 0;
          const saves = perf.saves ?? 0;
          const engagementRate = reach > 0 ? ((likes + comments + saves) / reach) * 100 : 0;
          return {
            id: p.id,
            platform: p.platform,
            content: p.content,
            scheduledAt: p.scheduledAt,
            status: p.status,
            reach,
            likes,
            comments,
            saves,
            engagementRate,
          };
        });
        postsMetrics.sort((a, b) => b.engagementRate - a.engagementRate);
        setPostsWithMetrics(postsMetrics);
      } catch {
        setPostsWithMetrics([]);
      }

      // Generate brief
      generateBrief(perfRes.data, prevPerfRes.data);

      setWeeklyBrief(null);
    } catch (err) {
      console.error('Failed to fetch analytics', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateRange, selectedBrandId]);

  const generateBrief = async (perf: PostPerformanceData, prevPerf: PostPerformanceData) => {
    if (!selectedBrandId) return;
    setIsGeneratingBrief(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const brandName = brandProfiles.find((b) => b.id === selectedBrandId)?.name || 'Your brand';
      const industry = brandProfiles.find((b) => b.id === selectedBrandId)?.industry || 'your industry';
      const reachChange = prevPerf.totalReach > 0
        ? ((perf.totalReach - prevPerf.totalReach) / prevPerf.totalReach * 100)
        : 0;
      const sentiment = reachChange > 5 ? 'strong' : reachChange > 0 ? 'positive' : reachChange > -5 ? 'steady' : 'challenging';
      const industryAvg = 3.5;
      const rateComparison = perf.avgEngagementRate > industryAvg ? 'above' : 'below';
      const bestPost = perf.byPlatform ? Object.entries(perf.byPlatform).sort((a, b) => b[1].engagements - a[1].engagements)[0] : null;

      const res = await axios.get(`${API_BASE}/api/analytics/insights`, {
        params: {
          startDate: subDays(new Date(), parseInt(dateRange, 10)).toISOString(),
          endDate: new Date().toISOString(),
          brandProfileId: selectedBrandId,
        },
        headers: { 'x-session-token': token },
      });
      const insightText = res.data.summary;
      const brief = `${brandName} had a ${sentiment} week on Instagram. You published ${perf.totalPostsPublished} posts and reached ${perf.totalReach.toLocaleString()} people. Your engagement rate was ${perf.avgEngagementRate.toFixed(1)}%, which is ${rateComparison} the industry average of ${industryAvg}% for ${industry}.${bestPost ? ` Your best performing platform was ${bestPost[0]} with ${bestPost[1].engagements} engagements.` : ''} ${insightText ? `Key insight: ${insightText.split('.')[0]}.` : ''}`;
      setWeeklyBrief(brief);
    } catch {
      const reachChange = prevPerformance && prevPerformance.totalReach > 0
        ? ((performance!.totalReach - prevPerformance.totalReach) / prevPerformance.totalReach * 100)
        : 0;
      const sentiment = reachChange > 5 ? 'strong' : reachChange > 0 ? 'positive' : reachChange > -5 ? 'steady' : 'challenging';
      setWeeklyBrief(`You had a ${sentiment} week with ${performance!.totalPostsPublished} posts reaching ${performance!.totalReach.toLocaleString()} people.`);
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const hasRealFollowerData = !!summary?.dataIntegrity?.realFollowers;

  const metricChips = performance && prevPerformance ? [
    {
      label: 'New Followers',
      value: hasRealFollowerData ? formatNumber(performance.totalReach) : '—',
      change: getChange(performance.totalReach, prevPerformance.totalReach),
      real: hasRealFollowerData,
    },
    { label: 'Posts Published', value: performance.totalPostsPublished.toString(), change: getChange(performance.totalPostsPublished, prevPerformance.totalPostsPublished), real: true },
    {
      label: 'Total Reach',
      value: hasRealFollowerData ? formatNumber(performance.totalReach) : '—',
      change: getChange(performance.totalReach, prevPerformance.totalReach),
      real: hasRealFollowerData,
    },
    {
      label: 'Avg Engagement',
      value: hasRealFollowerData ? performance.avgEngagementRate.toFixed(1) + '%' : '—',
      change: performance.avgEngagementRate - prevPerformance.avgEngagementRate,
      real: hasRealFollowerData,
    },
  ] : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 py-4 dark:border-slate-700 dark:bg-slate-900 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your marketing performance at a glance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedBrandId || ''}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {brandProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as '7' | '30' | '90')}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
          <button
            onClick={() => { loadReport(); }}
            className="flex items-center gap-1.5 rounded-md bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Weekly Report</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/50">
        {isLoading && !performance ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-teal-500" />
          </div>
        ) : performance ? (
          <div className="space-y-6 max-w-7xl mx-auto">

            {/* TOP SECTION — "Your week at a glance" */}
            <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-6 shadow-sm dark:border-teal-900/30 dark:bg-teal-950/20">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Your week at a glance
              </h2>

              {summary && !summary.dataIntegrity.realFollowers && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                  <span className="font-semibold">No platforms connected yet.</span>
                  <span className="text-amber-700/80 dark:text-amber-400/80">
                    Follower and reach numbers are unavailable — VIMO shows nothing rather than fake zeros. Connect an account to see real metrics.
                  </span>
                  <a
                    href="/connector-hub"
                    className="ml-auto rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
                  >
                    Connect a platform
                  </a>
                </div>
              )}

              {summary && summary.dataIntegrity.realFollowers && summary.platforms?.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {summary.platforms
                    .filter((p) => p.connected)
                    .map((p) => (
                      <span
                        key={p.platform}
                        className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium capitalize text-teal-700 dark:bg-slate-800/80 dark:text-teal-300"
                      >
                        {p.platform}: {formatNumber(p.followers)} followers
                      </span>
                    ))}
                </div>
              )}

              {isGeneratingBrief ? (
                <div className="flex items-center gap-3 py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-teal-500" />
                  <span className="text-sm text-teal-600 dark:text-teal-400">Generating your weekly brief...</span>
                </div>
              ) : weeklyBrief ? (
                <p className="text-base leading-relaxed text-teal-900 dark:text-teal-100">{weeklyBrief}</p>
              ) : (
                <p className="text-sm text-teal-600 dark:text-teal-400">Select a brand to see your weekly brief.</p>
              )}

              {metricChips.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {metricChips.map((chip) => (
                    <div
                      key={chip.label}
                      className={`rounded-xl p-3 ${
                        chip.real ? 'bg-white/80 dark:bg-slate-800/80' : 'bg-white/40 dark:bg-slate-800/40 opacity-70'
                      }`}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{chip.label}</p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className={`text-xl font-bold ${chip.real ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400 dark:text-slate-500'}`}>
                          {chip.value}
                        </span>
                        {chip.real && chip.change !== 0 && (
                          <span className={`flex items-center text-xs font-medium ${chip.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {chip.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(chip.change).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {!chip.real && (
                        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">No data — connect a platform</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MIDDLE SECTION — "What worked this week" */}
            <div>
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">What worked this week</h2>
              {postsWithMetrics.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <Megaphone className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No published posts this week. Publish some content to see performance data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {postsWithMetrics.map((post, idx) => (
                    <div
                      key={post.id}
                      className={`relative rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-800 ${
                        idx === 0 ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {idx === 0 && (
                        <div className="absolute -top-2.5 left-4 flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          <Trophy className="h-3 w-3" /> Best performer
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                          {post.platform[0]}
                        </div>
                        <span className="text-xs font-medium capitalize text-slate-500 dark:text-slate-400">{post.platform}</span>
                        <span className="ml-auto text-[10px] text-slate-400">
                          {format(parseISO(post.scheduledAt), 'MMM d')}
                        </span>
                      </div>
                      <p className="mb-3 text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{post.content}</p>
                      {post.reach === 0 && post.likes === 0 && post.comments === 0 && post.saves === 0 ? (
                        <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-[11px] text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
                          Awaiting performance data — metrics appear once this post is published and gathers engagement.
                        </p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-slate-400">Reach</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{formatNumber(post.reach)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Likes</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{post.likes}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Comments</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{post.comments}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400">Saves</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{post.saves}</p>
                          </div>
                        </div>
                      )}
                      {idx === 0 && (
                        <button
                          onClick={() => navigate(`/content?prefill=viral&topic=${encodeURIComponent(post.content)}&platform=${post.platform}`)}
                          className="mt-3 w-full flex items-center justify-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900/30 dark:bg-teal-950/20 dark:text-teal-400"
                        >
                          <ArrowUpRight className="h-3 w-3" /> Post more like this
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Marketing History Timeline */}
            <MarketingHistoryTimeline selectedBrandId={selectedBrandId || ''} />

            {/* Marketing Time Machine */}
            <MarketingTimeMachine />

            {/* BOTTOM SECTION — "What to do next week" */}
            <div>
              <button
                onClick={() => setShowRecommendations(!showRecommendations)}
                className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100 hover:text-teal-600 transition-colors"
              >
                <ChevronDown className={`h-5 w-5 transition-transform ${showRecommendations ? 'rotate-180' : ''}`} />
                What to do next week
              </button>
              {showRecommendations && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <RecommendationCard
                    icon={Clock}
                    title="Best day to post"
                    recommendation="Post on Tuesday and Thursday"
                    reasoning={performance && performance.byDayOfWeek.length > 0
                      ? (() => {
                          const maxDay = performance.byDayOfWeek.indexOf(Math.max(...performance.byDayOfWeek));
                          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                          return `Based on this week's data, ${dayNames[maxDay]} had the highest engagement. Schedule more content on ${dayNames[maxDay]}s.`;
                        })()
                      : 'Analyze more post data to determine the best day to post.'}
                  />
                  <RecommendationCard
                    icon={Target}
                    title="Content type to focus on"
                    recommendation={performance?.byPlatform ? Object.entries(performance.byPlatform).sort((a, b) => b[1].engagements - a[1].engagements)[0]?.[0] || 'Instagram' : 'Instagram'}
                    reasoning={performance?.byPlatform ? (() => {
                      const sorted = Object.entries(performance.byPlatform).sort((a, b) => b[1].engagements - a[1].engagements);
                      return sorted.length > 0 ? `${sorted[0][0]} had the most engagement this week with ${sorted[0][1].engagements} total engagements. Double down on ${sorted[0][0]} content.` : 'Publish more content to see which platform performs best.';
                    })() : 'Publish more content to see which type performs best.'}
                  />
                  <RecommendationCard
                    icon={TrendingUp}
                    title="One growth action"
                    recommendation="Engage with 5 accounts in your niche daily"
                    reasoning="Consistent engagement with accounts in your target audience helps build community and increases your visibility."
                  />
                </div>
              )}
            </div>

            {/* Deep Dive — collapsed by default */}
            <div>
              <button
                onClick={() => setShowDeepDive(!showDeepDive)}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-teal-600 transition-colors dark:text-slate-400"
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${showDeepDive ? 'rotate-90' : ''}`} />
                Detailed Data →
              </button>
              {showDeepDive && (
                <div className="mt-4 space-y-6">
                  {/* Charts */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Engagement by Platform</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={Object.entries(performance.byPlatform).map(([platform, data]) => ({
                              platform,
                              engagements: data.engagements,
                              reach: data.reach,
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                            <XAxis dataKey="platform" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(val) => formatNumber(val)} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                              itemStyle={{ color: '#14b8a6' }}
                            />
                            <Bar dataKey="engagements" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Posts per Day</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart
                            data={Object.entries(performance.byDate)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([date, count]) => ({ date: format(parseISO(date), 'MMM d'), posts: count }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                            <XAxis dataKey="date" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                              itemStyle={{ color: '#14b8a6' }}
                            />
                            <Line type="monotone" dataKey="posts" stroke="#14b8a6" strokeWidth={3} dot={{ fill: '#14b8a6', r: 4 }} activeDot={{ r: 6 }} />
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Heatmap */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Best Posting Times</h3>
                    <div className="overflow-x-auto">
                      <div className="min-w-[500px]">
                        <div className="grid grid-cols-[auto_1fr] gap-2">
                          <div className="flex flex-col justify-between py-2 text-xs text-slate-500">
                            {daysOfWeek.map((day) => (
                              <span key={day} className="h-6 flex items-center">{day}</span>
                            ))}
                          </div>
                          <div className="grid grid-rows-7 gap-1">
                            {daysOfWeek.map((_, dayIndex) => (
                              <div key={dayIndex} className="grid grid-cols-24 gap-1">
                                {Array.from({ length: 24 }).map((_, hourIndex) => {
                                  const val = (performance.byDayOfWeek[dayIndex] || 0) * (performance.byHourOfDay[hourIndex] || 0);
                                  const maxVal = Math.max(...performance.byDayOfWeek) * Math.max(...performance.byHourOfDay) || 1;
                                  const intensity = val / maxVal;
                                  let bgClass = 'bg-slate-100 dark:bg-slate-800';
                                  if (intensity > 0.8) bgClass = 'bg-teal-600';
                                  else if (intensity > 0.5) bgClass = 'bg-teal-500';
                                  else if (intensity > 0.2) bgClass = 'bg-teal-300 dark:bg-teal-700';
                                  else if (intensity > 0.05) bgClass = 'bg-teal-100 dark:bg-teal-900/50';
                                  return (
                                    <div
                                      key={hourIndex}
                                      title={`${daysOfWeek[dayIndex]} ${hourIndex}:00`}
                                      className={`h-6 w-full rounded-sm ${bgClass}`}
                                    />
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-[auto_1fr] gap-2 mt-1">
                          <div className="w-8" />
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Upcoming Posts */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Upcoming Posts (Next 7 Days)</h3>
                    {upcomingPosts.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">No posts scheduled for the next 7 days.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {upcomingPosts.map((post) => (
                          <div key={post.id} className="flex items-start p-3 border border-slate-100 dark:border-slate-700/50 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                            <div className="mr-3 mt-1 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                              {post.platform[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-900 dark:text-slate-200 truncate font-medium">{post.platform}</p>
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{post.content}</p>
                              <p className="text-[10px] text-slate-400 mt-2 font-mono uppercase">
                                {format(parseISO(post.scheduledAt), 'MMM d, h:mm a')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 max-w-7xl mx-auto">
            <BarChart className="h-12 w-12 text-teal-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">Your analytics will appear here after you publish your first post</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Start creating content to see how your brand performs.</p>
            <button
              onClick={() => navigate('/content')}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700"
            >
              Create your first post →
            </button>
          </div>
        )}
      </main>

      {/* Weekly Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-slate-800 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
                <FileText className="mr-2 h-6 w-6 text-teal-500" /> Weekly Report
              </h2>
              <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-500">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {isGeneratingReport ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="h-10 w-10 animate-spin text-teal-500 mb-4" />
                  <p className="text-slate-600 dark:text-slate-400">Compiling your weekly report...</p>
                </div>
              ) : weeklyReport ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Summary</h3>
                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{weeklyReport.summary}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-100 dark:border-teal-800/30">
                      <h3 className="font-semibold text-teal-900 dark:text-teal-300 mb-3">Highlights</h3>
                      <ul className="space-y-2">
                        {weeklyReport.highlights.map((item, i) => (
                          <li key={i} className="text-sm text-teal-800 dark:text-teal-200 flex items-start">
                            <span className="mr-2 text-teal-500">•</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-100 dark:border-indigo-800/30">
                      <h3 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-3">Recommendations</h3>
                      <ul className="space-y-2">
                        {weeklyReport.recommendations.map((item, i) => (
                          <li key={i} className="text-sm text-indigo-800 dark:text-indigo-200 flex items-start">
                            <span className="mr-2 text-indigo-500">•</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Key Metrics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <MetricPill label="Reach" value={formatNumber(weeklyReport.data.totalReach)} />
                      <MetricPill label="Engagements" value={formatNumber(weeklyReport.data.totalEngagements)} />
                      <MetricPill label="Posts" value={weeklyReport.data.totalPostsPublished.toString()} />
                      <MetricPill label="Rate" value={weeklyReport.data.avgEngagementRate.toFixed(1) + '%'} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="border-t border-slate-200 p-4 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setShowReportModal(false)}
                className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function loadReport() {
    if (!selectedBrandId) return;
    setIsGeneratingReport(true);
    setShowReportModal(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/analytics/weekly-report`, {
        params: { brandProfileId: selectedBrandId },
        headers: { 'x-session-token': token },
      });
      setWeeklyReport(res.data);
    } catch {
      // ignore
    } finally {
      setIsGeneratingReport(false);
    }
  }
}

function RecommendationCard({
  icon: Icon,
  title,
  recommendation,
  reasoning,
}: {
  icon: typeof Clock;
  title: string;
  recommendation: string;
  reasoning: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
          <Icon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</span>
      </div>
      <p className="mb-1 text-sm font-bold text-slate-900 dark:text-slate-100">{recommendation}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{reasoning}</p>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
