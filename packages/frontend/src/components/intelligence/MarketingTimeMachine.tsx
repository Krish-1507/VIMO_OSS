import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Clock, Loader2, Play, AlertTriangle, Lightbulb, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface TimelineEvent {
  weekLabel: string;
  date: string;
  event: string;
  metric: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  detail: string;
}

interface MarketingTimeline {
  question: string;
  timelineEvents: TimelineEvent[];
  narrative: string;
  rootCause: string;
  recommendation: string;
}

interface BrandProfile {
  id: string;
  name: string;
}

export default function MarketingTimeMachine() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [question, setQuestion] = useState('');
  const [timeline, setTimeline] = useState<MarketingTimeline | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchBrands = useCallback(async () => {
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/brand-profiles`, {
        headers: { 'x-session-token': token },
      });
      const data = res.data.map((p: BrandProfile) => ({ id: p.id, name: p.name }));
      setBrandProfiles(data);
      if (data.length > 0) setSelectedBrandId(data[0].id);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { fetchBrands(); }, []);

  const handleAnalyze = async () => {
    if (!selectedBrandId || !question.trim()) return;
    setIsLoading(true);
    setError('');
    setTimeline(null);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.post(
        `${API_BASE}/api/intelligence/time-machine`,
        { brandProfileId: selectedBrandId, question },
        { headers: { 'x-session-token': token } }
      );
      setTimeline(res.data);
    } catch (err) {
      setError('Failed to analyze. Please try again.');
      console.error('Time machine error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sentimentIcon = (sentiment: string) => {
    if (sentiment === 'positive') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (sentiment === 'negative') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-slate-400" />;
  };

  const sentimentDot = (sentiment: string) => {
    if (sentiment === 'positive') return 'bg-green-500';
    if (sentiment === 'negative') return 'bg-red-500';
    return 'bg-slate-400';
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
          <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Marketing Time Machine</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Ask questions about your marketing history</p>
        </div>
      </div>

      {/* Input area */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select
          value={selectedBrandId}
          onChange={(e) => setSelectedBrandId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white shrink-0"
        >
          {brandProfiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Ask a question: Why did my engagement drop? When did growth slow down? What happened last month?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
        <button
          onClick={handleAnalyze}
          disabled={isLoading || !question.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Analyze
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Rewinding your marketing history...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Timeline result */}
      {timeline && !isLoading && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Question */}
          <div className="rounded-lg bg-indigo-50 p-4 dark:bg-indigo-900/20">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">Your question</p>
            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200 italic">"{timeline.question}"</p>
          </div>

          {/* Vertical Timeline */}
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
            <div className="space-y-6">
              {timeline.timelineEvents.map((event, idx) => (
                <div key={idx} className="relative pl-10">
                  {/* Dot */}
                  <div className={`absolute left-2.5 top-1.5 h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-800 ${sentimentDot(event.sentiment)}`} />
                  {/* Content */}
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-400 uppercase">{event.weekLabel}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <div className="flex items-center gap-1">
                        {sentimentIcon(event.sentiment)}
                      </div>
                      <span className="ml-auto text-xs font-semibold text-indigo-600 dark:text-indigo-400">{event.metric}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{event.event}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{event.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Narrative */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-900/30 dark:bg-indigo-950/20">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-3">The Story</h4>
            <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-200">{timeline.narrative}</p>
          </div>

          {/* Root Cause */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-200 dark:bg-amber-800/40">
                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Most likely cause:</p>
                <p className="text-sm text-amber-800 dark:text-amber-200">{timeline.rootCause}</p>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/30 dark:bg-teal-950/20">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-200 dark:bg-teal-800/40">
                <Lightbulb className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-1">What to do now:</p>
                <p className="text-sm text-teal-800 dark:text-teal-200">{timeline.recommendation}</p>
              </div>
            </div>
          </div>

          {/* Ask another */}
          <div className="text-center">
            <button
              onClick={() => { setTimeline(null); setQuestion(''); }}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Ask another question →
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!timeline && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Clock className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Ask a question about your marketing history and discover the story behind your metrics.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Try: "Why did my engagement drop?" or "When did growth slow down?"
          </p>
        </div>
      )}
    </div>
  );
}
