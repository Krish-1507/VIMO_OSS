import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  TrendingUp,
  Target,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  ArrowRight,
  List,
} from 'lucide-react';
import { format } from 'date-fns';
import { socket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { isDemoMode } from '../lib/demoMode';
import { DEMO_DATA } from '../lib/demoData';
import DemoBadge from '../components/demo/DemoBadge';
import ConnectionHealthDashboard from '../components/dashboard/ConnectionHealthDashboard';
import GettingStartedChecklist from '../components/dashboard/GettingStartedChecklist';
import api from '../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Opportunity {
  id: string;
  type: string;
  title: string;
  description: string;
  potentialImpact: string;
  urgency: 'act_now' | 'act_today' | 'act_this_week';
  actionLabel: string;
  actionType: 'navigate' | 'execute' | 'approve_all';
  actionPayload: any;
  isActedOn: boolean;
  detectedAt: string;
}

interface MorningBriefing {
  greeting: string;
  opportunityCount: number;
  opportunities: Opportunity[];
  potentialTotalImpact: string;
  generatedAt: string;
}

interface AnalyticsStats {
  followers: number;
  posts: number;
  engagement: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const iconMap: Record<string, React.ReactNode> = {
  trend_to_capitalize: <TrendingUp className="w-5 h-5" />,
  competitor_alert: <Target className="w-5 h-5" />,
  engagement_needed: <MessageCircle className="w-5 h-5" />,
  momentum_concern: <AlertTriangle className="w-5 h-5" />,
  content_ready: <Sparkles className="w-5 h-5" />,
  video_ready: <Play className="w-5 h-5" />,
  approval_waiting: <CheckCircle2 className="w-5 h-5" />,
  unimplemented_lesson: <List className="w-5 h-5" />,
};

const urgencyColors: Record<Opportunity['urgency'], string> = {
  act_now: 'bg-red-500/10 text-red-500 border-red-500/20',
  act_today: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  act_this_week: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const navigate = useNavigate();
  const { sessionToken } = useAuthStore();
  const demoActive = isDemoMode();

  const [isLoading, setIsLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<AnalyticsStats>({ followers: 0, posts: 0, engagement: 0 });
  const [isActing, setIsActing] = useState<string | null>(null);
  const [hasDataSources, setHasDataSources] = useState(false);
  const [isRunningDirector, setIsRunningDirector] = useState(false);
  const [directorMessage, setDirectorMessage] = useState<string | null>(null);

  // Claude-style interactive greeting
  const [greetingMode, setGreetingMode] = useState<'assistant' | 'next' | 'summary' | 'plan'>('assistant');
  const [greetingText, setGreetingText] = useState<string>('Hello—ready to review what needs your attention today?');

  // Demo Mode: load the sample brand instead of calling the backend.
  const loadDemo = () => {
    setOpportunities(DEMO_DATA.opportunities);
    setHasDataSources(true);
    setStats({
      followers: DEMO_DATA.analytics.followers,
      posts: DEMO_DATA.analytics.posts,
      engagement: DEMO_DATA.analytics.engagement,
    });
    setIsLoading(false);
  };

  useEffect(() => {
    if (!sessionToken) {
      navigate('/login');
      return;
    }

    if (demoActive) {
      loadDemo();
      return;
    }

    fetchInbox();

    const handleSessionComplete = () => fetchInbox();
    const handleApproval = () => fetchInbox();

    socket.on('director:session_complete', handleSessionComplete);
    socket.on('approval:requested', handleApproval);
    socket.on('approval:executed', handleApproval);
    socket.on('approval:rejected', handleApproval);

    return () => {
      socket.off('director:session_complete', handleSessionComplete);
      socket.off('approval:requested', handleApproval);
      socket.off('approval:executed', handleApproval);
      socket.off('approval:rejected', handleApproval);
    };
  }, [sessionToken, navigate, demoActive]);

  useEffect(() => {
    const count = opportunities.length;
    switch (greetingMode) {
      case 'next':
        setGreetingText(
          count > 0
            ? `Next step: review the ${count} active opportunity${count === 1 ? '' : 'ies'} in your inbox, then approve the ones you want executed.`
            : `You’re all caught up. If you’d like, I can help you draft a new plan for upcoming content and campaigns.`
        );
        break;
      case 'summary':
        setGreetingText(
          briefing?.greeting ? `Quick summary: ${briefing.greeting}` : `Quick summary: your Marketing Director is monitoring signals and preparing what to do next.`
        );
        break;
      case 'plan':
        setGreetingText(`Plan: (1) confirm your brand focus, (2) pick one channel to prioritize, (3) approve the highest-impact actions from the inbox.`);
        break;
      case 'assistant':
      default:
        setGreetingText('Hello—ready to review what needs your attention today?');
        break;
    }
  }, [greetingMode, opportunities.length, briefing]);

  const fetchInbox = async () => {
    if (!sessionToken) return;
    try {
      const [oppRes, dirRes, socialRes, packsRes] = await Promise.all([
        api.get('/api/opportunities'),
        api.get('/api/director/latest').catch(() => ({ data: { session: null } })),
        api.get('/api/social-accounts/connected').catch(() => ({ data: { platforms: [] } })),
        api.get('/api/packs/installed').catch(() => ({ data: { packs: [] } })),
      ]);

      setOpportunities(oppRes.data || []);

      const session = dirRes.data.session;
      if (session?.morningBriefingJson) {
        try {
          setBriefing(session.morningBriefingJson);
        } catch {
          // ignore
        }
      }

      const platforms = socialRes.data?.platforms || socialRes.data || [];
      const packs = packsRes.data?.packs || [];
      const hasSources = platforms.length > 0 || packs.length > 0;
      setHasDataSources(hasSources);

      if (hasSources) {
        // Try to get real snapshot data if connectors exist
        const snapshotRes = await api.get('/api/analytics/summary').catch(() => null);
        if (snapshotRes?.data) {
          setStats({
            followers: snapshotRes.data.totalFollowers ?? 0,
            posts: snapshotRes.data.totalPosts ?? 0,
            engagement: snapshotRes.data.avgEngagement ?? 0,
          });
        } else {
          setStats({ followers: 0, posts: 0, engagement: 0 });
        }
      } else {
        setStats({ followers: 0, posts: 0, engagement: 0 });
      }
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAct = async (opp: Opportunity) => {
    if (isActing) return;
    setIsActing(opp.id);
    try {
      if (demoActive) {
        if (opp.actionType === 'navigate') navigate(opp.actionPayload?.route || '/campaigns');
        else setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
        return;
      }
      const res = await api.post(`/api/opportunities/${opp.id}/act`);
      if (res.data.actionType === 'navigate') {
        navigate(res.data.route);
      } else {
        await fetchInbox();
      }
    } catch (err) {
      console.error('Failed to act:', err);
    } finally {
      setIsActing(null);
    }
  };

  const handleDismiss = async (id: string) => {
    if (demoActive) {
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
      return;
    }
    try {
      await api.delete(`/api/opportunities/${id}`);
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      console.error('Failed to dismiss:', err);
    }
  };

  const runDirector = async () => {
    if (isRunningDirector) return;
    setIsRunningDirector(true);
    setDirectorMessage('Marketing Director is analyzing your brand…');
    try {
      await api.post('/api/director/run');
      // The director runs async and emits socket events; refresh shortly after.
      setTimeout(async () => {
        await fetchInbox();
        setIsRunningDirector(false);
        setDirectorMessage('Done — fresh opportunities are in your inbox.');
        setTimeout(() => setDirectorMessage(null), 4000);
      }, 4000);
    } catch (err) {
      console.error('Failed to run director:', err);
      setIsRunningDirector(false);
      setDirectorMessage('Could not start the Marketing Director. Try again.');
      setTimeout(() => setDirectorMessage(null), 4000);
    }
  };

  const actAll = async () => {
    if (isActing) return;
    setIsActing('all');
    try {
      if (demoActive) {
        setOpportunities([]);
        return;
      }
      await api.post('/api/opportunities/act-all');
      await fetchInbox();
    } catch (err) {
      console.error('Failed to act all:', err);
    } finally {
      setIsActing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Zap className="h-5 w-5 animate-pulse text-teal-500" />
          <span>Loading Opportunity Inbox...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Demo brand context — clearly labelled sample data */}
      {demoActive && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 text-lg font-bold text-white shadow">
                A
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{DEMO_DATA.brand.name}</h2>
                  <DemoBadge />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{DEMO_DATA.brand.tagline}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{DEMO_DATA.connectedPlatforms.length}</span>
              platforms connected
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DEMO_DATA.connectedPlatforms.map((p) => (
              <span
                key={p.provider}
                className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300"
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Connection health — self-healing, one-click reconnect */}
      {!demoActive && <ConnectionHealthDashboard compact className="shadow-sm" />}

      {/* Claude-style interactive greeting */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="p-5 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/30">
            <Zap className="h-5 w-5 text-teal-700 dark:text-teal-300" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">VIMO Assistant</h2>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Interactive</span>
            </div>

            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{greetingText}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setGreetingMode('next')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  greetingMode === 'next'
                    ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/10 dark:text-slate-300 dark:hover:bg-slate-800/50'
                }`}
              >
                What should I do next?
              </button>

              <button
                onClick={() => setGreetingMode('summary')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  greetingMode === 'summary'
                    ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/10 dark:text-slate-300 dark:hover:bg-slate-800/50'
                }`}
              >
                Summarize my status
              </button>

              <button
                onClick={() => setGreetingMode('plan')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  greetingMode === 'plan'
                    ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/10 dark:text-slate-300 dark:hover:bg-slate-800/50'
                }`}
              >
                Create a quick plan
              </button>

              <button
                onClick={runDirector}
                disabled={isRunningDirector}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {isRunningDirector ? (
                  <><span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</>
                ) : (
                  <><Play className="h-3.5 w-3.5" /> Run Marketing Director Now</>
                )}
              </button>
            </div>

            {directorMessage && (
              <p className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-300">{directorMessage}</p>
            )}
          </div>
        </div>
      </div>

      {/* Post-onboarding guided success path */}
      {!demoActive && <GettingStartedChecklist />}

      {/* Collapsible Stats Section */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <button
          onClick={() => setShowStats(!showStats)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            Performance Snapshot
          </div>
          {showStats ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 pt-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            {!hasDataSources ? (
              <div className="col-span-full p-6 rounded-xl bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 text-center">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  No data sources connected yet
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Connect social accounts or install packs from the Connector Hub to see your stats here.
                </p>
                <button
                  onClick={() => navigate('/connector-hub')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
                >
                  Browse Connector Hub
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Followers</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {stats.followers > 0 ? stats.followers.toLocaleString() : (
                      <span className="text-sm font-normal text-slate-400">Syncing...</span>
                    )}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Engagement Rate</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {stats.engagement > 0 ? `${stats.engagement}%` : (
                      <span className="text-sm font-normal text-slate-400">Awaiting data</span>
                    )}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Posts</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {stats.posts > 0 ? stats.posts.toLocaleString() : (
                      <span className="text-sm font-normal text-slate-400">Waiting for data</span>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Inbox List */}
      <div className="space-y-4">
        {opportunities.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={actAll}
              disabled={isActing !== null}
              className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-50"
            >
              Approve All Standard Actions
            </button>
          </div>
        )}

        {opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20">
            <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Inbox Zero</h3>
            {!hasDataSources ? (
              <div className="text-center max-w-sm mx-auto">
                <p className="text-slate-500 dark:text-slate-400 mb-3">
                  No data sources connected — VIMO's Marketing Director needs at least one social account or pack to start finding opportunities.
                </p>
                <button
                  onClick={() => navigate('/connector-hub')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
                >
                  Connect your first tool
                </button>
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                You've handled all current opportunities. We'll let you know when the Marketing Director finds something new.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                className="group relative flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-200"
              >
                {/* Icon Column */}
                <div className="shrink-0 flex items-start sm:items-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                    {iconMap[opp.type] || <Zap className="w-5 h-5" />}
                  </div>
                </div>

                {/* Content Column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${urgencyColors[opp.urgency]}`}
                    >
                      {opp.urgency.replace('act_', '').replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{format(new Date(opp.detectedAt), 'h:mm a')}</span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">{opp.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{opp.description}</p>
                  {opp.potentialImpact && (
                    <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                      <TrendingUp className="w-3 h-3" />
                      {opp.potentialImpact}
                    </div>
                  )}
                </div>

                {/* Action Column */}
                <div className="shrink-0 flex items-center gap-2 sm:flex-col sm:items-end">
                  <button
                    onClick={() => handleAct(opp)}
                    disabled={isActing === opp.id}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isActing === opp.id ? 'Working...' : opp.actionLabel}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDismiss(opp.id)}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

