import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Zap, Play, Pause, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { io as socketIO, Socket } from 'socket.io-client';
import AutopilotTimeline, { AutopilotTimelineEntry } from '../components/dashboard/AutopilotTimeline';

const API_BASE = import.meta.env.VITE_API_URL || '';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

/* ------------------------------------------------------------------ */
/*  Goal templates (matching backend)                                  */
/* ------------------------------------------------------------------ */

const GOAL_TYPES = [
  { key: 'product_launch', label: 'Launch a product', emoji: '🚀', description: 'Generate buzz and drive adoption' },
  { key: 'grow_followers', label: 'Grow followers', emoji: '📈', description: 'Build your audience and reach' },
  { key: 'drive_website_traffic', label: 'Drive website traffic', emoji: '🌐', description: 'Get people to your site' },
  { key: 'build_brand_authority', label: 'Build authority', emoji: '🏆', description: 'Establish thought leadership' },
  { key: 'promote_event', label: 'Promote an event', emoji: '🎪', description: 'Fill seats and create buzz' },
  { key: 'seasonal_sale', label: 'Run a promotion', emoji: '💥', description: 'Drive sales with urgency' },
];

const DURATIONS = [
  { days: 14, label: '2 Weeks' },
  { days: 28, label: '4 Weeks' },
  { days: 42, label: '6 Weeks' },
  { days: 56, label: '8 Weeks' },
];

/* ------------------------------------------------------------------ */
/*  Brand Profile interface                                            */
/* ------------------------------------------------------------------ */

interface BrandProfile {
  id: string;
  name: string;
}

interface AutopilotSession {
  id: string;
  brandProfileId: string;
  audienceDescription: string;
  primaryGoal: string;
  goalType: string;
  durationDays: number;
  status: string;
  progressPercent: number;
  log: string[];
  timeline?: AutopilotTimelineEntry[];
  contentCalendar: any[] | null;
  scheduledPostIds: string[];
  strategyDocument: string | null;
  startDate: string;
  endDate: string;
  completedAt: string | null;
  createdAt: string;
}

export default function AutopilotPage() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [audienceDescription, setAudienceDescription] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(28);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [activeSession, setActiveSession] = useState<AutopilotSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<AutopilotTimelineEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [currentPhase, setCurrentPhase] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch brand profiles
  const fetchBrandProfiles = useCallback(async () => {
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/brand-profiles`, {
        headers: { 'x-session-token': token },
      });
      const data = res.data.map((p: BrandProfile) => ({ id: p.id, name: p.name }));
      setBrandProfiles(data);
      if (data.length > 0 && !selectedBrandId) {
        setSelectedBrandId(data[0].id);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchBrandProfiles(); }, []);

  // Fetch connected channels when brand is selected
  useEffect(() => {
    if (!selectedBrandId) return;
    const fetchChannels = async () => {
      try {
        const token = localStorage.getItem('session_token') || '';
        const res = await axios.get(`${API_BASE}/api/connectors`, {
          headers: { 'x-session-token': token },
        });
        const active = (res.data || [])
          .filter((c: any) => c.status === 'active' && c.type === 'social')
          .map((c: any) => c.provider);
        setAvailableChannels(active);
        setSelectedChannels(active);
      } catch {
        setAvailableChannels([]);
      }
    };
    fetchChannels();
  }, [selectedBrandId]);

  // Check for existing active autopilot
  useEffect(() => {
    if (!selectedBrandId) return;
    const checkActive = async () => {
      try {
        const token = localStorage.getItem('session_token') || '';
        const res = await axios.get(`${API_BASE}/api/autopilot/active`, {
          params: { brandProfileId: selectedBrandId },
          headers: { 'x-session-token': token },
        });
        if (res.data) {
          setActiveSession(res.data);
          setLog(res.data.log || []);
          setTimeline(res.data.timeline || []);
          setProgress(res.data.progressPercent || 0);
          setStatus(res.data.status);
        }
      } catch {
        setActiveSession(null);
      }
    };
    checkActive();
  }, [selectedBrandId]);

  // Socket.io listener for real-time updates
  useEffect(() => {
    if (!activeSession) return;
    const socket: Socket = socketIO(SOCKET_URL);
    socket.on('connect', () => {
      console.log('[Autopilot] Socket connected');
    });
    socket.on('autopilot:status_update', (data: AutopilotSession) => {
      if (data.id === activeSession.id) {
        setLog(data.log || []);
        setTimeline(data.timeline || []);
        setProgress(data.progressPercent || 0);
        setStatus(data.status);
        setCurrentPhase((data as any).currentPhase || '');
      }
    });
    socket.on('autopilot:fully_active', (data: AutopilotSession) => {
      if (data.id === activeSession.id) {
        setLog(data.log || []);
        setTimeline(data.timeline || []);
        setProgress(100);
        setStatus('monitoring');
        setActiveSession(data);
      }
    });
    return () => { socket.disconnect(); };
  }, [activeSession]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // Start autopilot
  const handleStart = async () => {
    if (!selectedBrandId || !selectedGoal || !audienceDescription || selectedChannels.length === 0) return;
    setIsStarting(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.post(
        `${API_BASE}/api/autopilot/start`,
        {
          brandProfileId: selectedBrandId,
          audienceDescription,
          primaryGoal: GOAL_TYPES.find((g) => g.key === selectedGoal)?.label || selectedGoal,
          goalType: selectedGoal,
          durationDays: selectedDuration,
          channels: selectedChannels,
        },
        { headers: { 'x-session-token': token } }
      );
      // Immediately set active session with the returned ID
      const session: AutopilotSession = {
        id: res.data.autopilotId,
        brandProfileId: selectedBrandId,
        audienceDescription,
        primaryGoal: selectedGoal,
        goalType: selectedGoal,
        durationDays: selectedDuration,
        status: 'initializing',
        progressPercent: 0,
        log: ['Autopilot launched. Initializing...'],
        timeline: [],
        contentCalendar: null,
        scheduledPostIds: [],
        strategyDocument: null,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + selectedDuration * 24 * 60 * 60 * 1000).toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
      };
      setActiveSession(session);
      setLog(session.log);
      setTimeline(session.timeline || []);
      setProgress(0);
      setStatus('initializing');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to start autopilot';
      setLog([`Error: ${msg}`]);
    } finally {
      setIsStarting(false);
    }
  };

  // Pause autopilot
  const handlePause = async () => {
    if (!activeSession) return;
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(
        `${API_BASE}/api/autopilot/${activeSession.id}/pause`,
        {},
        { headers: { 'x-session-token': token } }
      );
      setStatus('paused');
      setLog([...log, 'Autopilot paused by user.']);
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  };

  // Toggle channel selection
  const toggleChannel = (channel: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const isRunning = status && ['initializing', 'researching', 'strategizing', 'creating_content', 'scheduling', 'activating_engagement', 'monitoring'].includes(status);

  return (
    <div className="flex h-full flex-col bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-700/50 bg-slate-900 px-4 sm:px-6 py-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-teal-400" />
            Autopilot
          </h1>
          <p className="text-sm text-slate-400">One-click autonomous marketing</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            {brandProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-slate-900">
        {activeSession && isRunning ? (
          /* Active State */
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {/* Status indicator */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-teal-500" />
                </span>
                <div>
                  <span className="text-sm font-bold text-white">Autopilot Active</span>
                  {currentPhase && (
                    <p className="text-xs text-slate-400 mt-0.5">Currently: {currentPhase}</p>
                  )}
                </div>
                {status === 'paused' && (
                  <span className="ml-auto text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">Paused</span>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                <div
                  className="bg-teal-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{progress}% complete</span>
                <span>{status}</span>
              </div>
            </div>

            {/* Transparent Autopilot timeline — what VIMO did and why */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 max-h-[28rem] overflow-y-auto">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                Autopilot Activity — what VIMO did &amp; why
              </h3>
              <AutopilotTimeline
                timeline={timeline}
                fallbackLog={log}
                status={status}
              />
              <div ref={logEndRef} />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              {status !== 'paused' && (
                <button
                  onClick={handlePause}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-all active:scale-95"
                >
                  <Pause className="h-4 w-4" />
                  Pause autopilot
                </button>
              )}
              <a
                href="/scheduler"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-all"
              >
                <ExternalLink className="h-4 w-4" />
                View scheduled posts
              </a>
            </div>

            {/* Summary when monitoring */}
            {status === 'monitoring' && activeSession && (
              <div className="rounded-xl border border-teal-900/30 bg-teal-950/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-teal-400" />
                  <h3 className="text-sm font-bold text-teal-400">Autopilot is running</h3>
                </div>
                <p className="text-sm text-teal-200/80 leading-relaxed">
                  {activeSession.scheduledPostIds?.length || 0} posts scheduled over {activeSession.durationDays || 0} days.
                  First post is queued. VIMO is watching your engagement and will reply to comments automatically.
                  Your next progress report will be available soon.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Setup State */
          <div className="max-w-xl mx-auto py-8 px-4">
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/10">
                <Zap className="h-8 w-8 text-teal-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">One-click marketing autopilot.</h2>
              <p className="text-sm text-slate-400">Tell VIMO your goal. Click GO. Your marketing runs itself.</p>
            </div>

            {/* Goal selector */}
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">What is your goal?</p>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_TYPES.map((goal) => (
                  <button
                    key={goal.key}
                    onClick={() => setSelectedGoal(goal.key)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                      selectedGoal === goal.key
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-lg shrink-0">{goal.emoji}</span>
                    <div>
                      <p className={`text-sm font-bold ${selectedGoal === goal.key ? 'text-teal-400' : 'text-white'}`}>
                        {goal.label}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{goal.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audience description */}
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Who is your audience?</p>
              <textarea
                value={audienceDescription}
                onChange={(e) => setAudienceDescription(e.target.value)}
                placeholder="Describe who you want to reach — be specific. E.g. 'Startup founders in B2B SaaS, 25-40, early stage'"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none h-24"
              />
            </div>

            {/* Duration selector */}
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Campaign duration</p>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.days}
                    onClick={() => setSelectedDuration(d.days)}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all ${
                      selectedDuration === d.days
                        ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel selector */}
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Connected platforms</p>
              {availableChannels.length === 0 ? (
                <p className="text-sm text-slate-500">No connected platforms found. Connect a social account in Connector Hub first.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableChannels.map((channel) => (
                    <button
                      key={channel}
                      onClick={() => toggleChannel(channel)}
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                        selectedChannels.includes(channel)
                          ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                          : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {channel.charAt(0).toUpperCase() + channel.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* GO button */}
            <button
              onClick={handleStart}
              disabled={!selectedBrandId || !selectedGoal || !audienceDescription || selectedChannels.length === 0 || isStarting}
              className="w-full flex items-center justify-center gap-3 rounded-2xl bg-teal-500 py-4 text-lg font-bold text-white hover:bg-teal-400 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-teal-500/20"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Zap className="h-6 w-6" />
                  GO
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-600 mt-3">
              Once started, VIMO will research trends, build a strategy, create all content, schedule it, and monitor performance — automatically.
            </p>
          </div>
        )}

        {/* Show completed/paused sessions as non-active */}
        {activeSession && !isRunning && status !== 'paused' && (
          <div className="max-w-xl mx-auto p-6 text-center">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-8">
              <CheckCircle className="mx-auto h-10 w-10 text-teal-400 mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">
                Autopilot {status === 'completed' ? 'Complete' : status}
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                {activeSession.scheduledPostIds?.length || 0} posts were scheduled.
              </p>
              <button
                onClick={() => { setActiveSession(null); setLog([]); setProgress(0); setStatus(''); }}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-400 transition-all"
              >
                <Play className="h-4 w-4" />
                Start new autopilot
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
