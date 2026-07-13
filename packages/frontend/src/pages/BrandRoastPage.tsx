import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Flame,
  ChevronDown,
  ChevronUp,
  Share2,
  Globe,
  Instagram,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Target,
  MessageSquare,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface RoastItem {
  problem: string;
  severity: 'brutal' | 'bad' | 'fixable';
  fix: string;
  example: string;
}

interface BrandRoast {
  roastId: string;
  brandName: string;
  overallScore: number;
  positioningProblems: RoastItem[];
  messagingProblems: RoastItem[];
  contentProblems: RoastItem[];
  competitorGaps: RoastItem[];
  funnelProblems: RoastItem[];
  quickWins: string[];
  generatedAt: string;
}

interface BrandProfile {
  id: string;
  name: string;
}

const loadingMessages = [
  'Analyzing your posts...',
  'Reading your competitors...',
  'Finding the brutal truth...',
  'Almost done...',
  'Preparing your roast...',
];

const severityConfig = {
  brutal: { label: 'Brutal', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  bad: { label: 'Bad', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  fixable: { label: 'Fixable', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

const categoryIcons: Record<string, typeof Target> = {
  positioningProblems: Target,
  messagingProblems: MessageSquare,
  contentProblems: Sparkles,
  competitorGaps: TrendingUp,
  funnelProblems: AlertTriangle,
};

const categoryLabels: Record<string, string> = {
  positioningProblems: 'Positioning Problems',
  messagingProblems: 'Messaging Problems',
  contentProblems: 'Content Problems',
  competitorGaps: 'Competitor Gaps',
  funnelProblems: 'Funnel Problems',
};

export default function BrandRoastPage() {
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [roast, setRoast] = useState<BrandRoast | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [hasRoast, setHasRoast] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

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

  // Check for existing roast
  useEffect(() => {
    if (!selectedBrandId) return;
    const checkRoast = async () => {
      try {
        const token = localStorage.getItem('session_token') || '';
        const res = await axios.get(`${API_BASE}/api/roast/latest`, {
          params: { brandProfileId: selectedBrandId },
          headers: { 'x-session-token': token },
        });
        if (res.data) {
          setRoast(res.data);
          setHasRoast(true);
        }
      } catch {
        // No roast yet
        setHasRoast(false);
        setRoast(null);
      }
    };
    checkRoast();
  }, [selectedBrandId]);

  // Loading message rotation
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMsgIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleRoast = async () => {
    if (!selectedBrandId) return;
    setIsLoading(true);
    setLoadingMsgIndex(0);
    setRoast(null);
    setHasRoast(false);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.post(
        `${API_BASE}/api/roast/generate`,
        {
          brandProfileId: selectedBrandId,
          websiteUrl: websiteUrl || undefined,
          instagramHandle: instagramHandle || undefined,
        },
        { headers: { 'x-session-token': token }, timeout: 60000 }
      );
      setRoast(res.data);
      setHasRoast(true);
      // Auto-expand all sections
      setExpandedSections({
        positioningProblems: true,
        messagingProblems: true,
        contentProblems: true,
        competitorGaps: true,
        funnelProblems: true,
      });
    } catch (err) {
      console.error('Roast failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleShare = async () => {
    if (!roast) return;
    const topProblem = roast.positioningProblems[0]?.problem || roast.messagingProblems[0]?.problem || '';
    const text = `VIMO just roasted my brand's marketing and gave me a score of ${roast.overallScore}/100. The AI said: '${topProblem}'. Get your free brand roast at github.com/vimo`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const verdictText = (score: number) => {
    if (score < 40) return 'Your marketing has serious problems. Here is the unfiltered truth.';
    if (score <= 70) return 'You are doing some things right but leaving a lot on the table.';
    return 'Strong foundation, but there is still room to push harder.';
  };

  const scoreColor = (score: number) => {
    if (score < 40) return 'text-red-500';
    if (score <= 70) return 'text-amber-500';
    return 'text-green-500';
  };

  const renderCategory = (key: string, items: RoastItem[]) => {
    if (!items || items.length === 0) return null;
    const Icon = categoryIcons[key] || AlertTriangle;
    const isExpanded = expandedSections[key];

    return (
      <div key={key} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden">
        <button
          onClick={() => toggleSection(key)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
              <Icon className="h-4 w-4 text-red-500" />
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100">{categoryLabels[key]}</span>
            <span className="text-xs text-slate-400">({items.length})</span>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {isExpanded && (
          <div className="border-t border-slate-100 dark:border-slate-700">
            {items.map((item, idx) => (
              <div key={idx} className="p-4 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-2">
                      {item.problem}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${severityConfig[item.severity]?.color || severityConfig.fixable.color}`}>
                      {severityConfig[item.severity]?.label || 'Fixable'}
                    </span>
                    <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800/30 dark:bg-teal-950/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">The fix:</p>
                      <p className="text-sm text-teal-800 dark:text-teal-200">{item.fix}</p>
                    </div>
                    <div className="mt-2 italic text-xs text-slate-400 dark:text-slate-500 p-2 border-l-2 border-slate-300 dark:border-slate-600">
                      <span className="font-medium text-slate-500 dark:text-slate-400">What good looks like: </span>
                      {item.example}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Flame className="h-6 w-6 text-red-500" />
            Brand Roast
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Brutal honesty. Zero filters. Real fixes.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {brandProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/50">
        {isLoading ? (
          /* Loading State */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative mb-8">
              <Flame className="h-16 w-16 text-red-500 animate-pulse" />
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 animate-ping" />
            </div>
            <div className="h-8 flex items-center mb-4">
              <p key={loadingMsgIndex} className="text-lg font-bold text-slate-700 dark:text-slate-300 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {loadingMessages[loadingMsgIndex]}
              </p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-red-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : !hasRoast || !roast ? (
          /* Empty State */
          <div className="max-w-lg mx-auto py-12">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
                <Flame className="h-10 w-10 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">Get your brand roasted</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                VIMO will analyze your marketing with brutal honesty and tell you exactly what is broken and how to fix it. Free. No filters. No sugarcoating.
              </p>

              {/* Optional fields */}
              <div className="space-y-3 mb-6">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="url"
                    placeholder="Website URL (optional — makes the roast more accurate)"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 pr-4 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="relative">
                  <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Instagram handle (optional — we will analyze your feed)"
                    value={instagramHandle}
                    onChange={(e) => setInstagramHandle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 pr-4 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                onClick={handleRoast}
                disabled={!selectedBrandId}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-8 py-3 text-sm font-bold text-white hover:bg-red-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20"
              >
                <Flame className="h-5 w-5" />
                Roast my brand
              </button>
            </div>
          </div>
        ) : (
          /* Roast Result State */
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Score */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className={`inline-flex items-center justify-center w-28 h-28 rounded-full border-4 ${roast.overallScore < 40 ? 'border-red-400' : roast.overallScore <= 70 ? 'border-amber-400' : 'border-green-400'} mb-4`}>
                <span className={`text-4xl font-black ${scoreColor(roast.overallScore)}`}>
                  {roast.overallScore}
                </span>
              </div>
              <p className={`text-lg font-bold ${scoreColor(roast.overallScore)}`}>
                {verdictText(roast.overallScore)}
              </p>
              <button
                onClick={handleShare}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    Share my roast score
                  </>
                )}
              </button>
            </div>

            {/* Problem Categories */}
            <div className="space-y-3">
              {renderCategory('positioningProblems', roast.positioningProblems)}
              {renderCategory('messagingProblems', roast.messagingProblems)}
              {renderCategory('contentProblems', roast.contentProblems)}
              {renderCategory('competitorGaps', roast.competitorGaps)}
              {renderCategory('funnelProblems', roast.funnelProblems)}
            </div>

            {/* Quick Wins */}
            {roast.quickWins && roast.quickWins.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-4">
                  <Lightbulb className="h-4 w-4" />
                  Quick Wins This Week
                </h3>
                <ol className="space-y-3">
                  {roast.quickWins.map((win, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-xs font-bold text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300">
                        {idx + 1}
                      </span>
                      <p className="text-sm text-emerald-800 dark:text-emerald-200 pt-0.5">{win}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Regenerate button */}
            <div className="text-center pb-8">
              <button
                onClick={handleRoast}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20"
              >
                <Flame className="h-4 w-4" />
                Roast me again
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
