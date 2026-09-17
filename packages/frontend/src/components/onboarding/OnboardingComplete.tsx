import { useState, useEffect } from 'react';
import { Check, Sparkles, ArrowRight, Rocket, PartyPopper, Loader2, Circle, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStore } from '../../stores/onboardingStore';
import api from '../../lib/api';

interface Props {
  onFinish: () => void;
}

interface Milestone {
  key: string;
  label: string;
  done: boolean;
  cta?: string;
  route?: string;
}

export default function OnboardingComplete({ onFinish }: Props) {
  const navigate = useNavigate();
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const [visible, setVisible] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Real status, checked live — we never show fake checkmarks. Anything the
  // user skipped shows as a pending item with a one-click way to finish it.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [connRes, brandRes, socialRes] = await Promise.all([
          api.get('/api/connectors').catch(() => ({ data: [] as any[] })),
          api.get('/api/brand-profiles').catch(() => ({ data: [] as any[] })),
          api.get('/api/social-accounts/status').catch(() => ({ data: { isConnected: false } })),
        ]);
        if (cancelled) return;
        const connectors = (connRes.data as any[]) || [];
        const hasAI = connectors.some((c) => c.type === 'llm' && c.status === 'active');
        const brands = (brandRes.data as any[]) || [];
        const hasSocial =
          Boolean((socialRes.data as any)?.isConnected) ||
          connectors.some((c) => c.type === 'social' && c.status === 'active');
        setMilestones([
          {
            key: 'ai',
            label: hasAI ? 'AI provider connected' : 'AI provider — add one anytime',
            done: hasAI,
            cta: hasAI ? undefined : 'Add key',
            route: '/settings',
          },
          {
            key: 'brand',
            label: brands.length > 0 ? `Brand ready — ${brands[0]?.name || 'your brand'}` : 'Brand — create one anytime',
            done: brands.length > 0,
            cta: brands.length > 0 ? undefined : 'Create brand',
            route: '/settings',
          },
          {
            key: 'social',
            label: hasSocial ? 'Social account connected' : 'Social accounts — connect anytime',
            done: hasSocial,
            cta: hasSocial ? undefined : 'Connect',
            route: '/social-accounts',
          },
          {
            key: 'agent',
            label: 'Marketing agent ready — just tell it what to do',
            done: true,
          },
        ]);
      } catch (err) {
        if (!cancelled) console.warn('[vimo] failed to load completion status:', err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistAndGo(target: string, openAssistant: boolean) {
    if (finishing) return;
    setFinishing(true);
    setFinishError('');
    // THE persistence fix: record 'complete' server-side. The backend only
    // marks onboarding done on the 'complete' step (or 5 steps); the wizard
    // posts just 4 before this screen, so without this call it reappears on
    // every reload. completeStep swallows errors internally, so verify.
    await completeStep('complete');
    if (!useOnboardingStore.getState().isComplete) {
      setFinishError("Couldn't save your progress — check the connection and try again.");
      setFinishing(false);
      return;
    }
    if (openAssistant) {
      try {
        sessionStorage.setItem('vimo_open_assistant', '1');
      } catch (err) {
        console.warn('[vimo] failed to set assistant auto-open flag:', err);
      }
    }
    onFinish();
    navigate(target, { replace: true });
  }

  function handleOpen() {
    void persistAndGo('/dashboard', false);
  }

  function handleMeetAgent() {
    void persistAndGo('/dashboard', true);
  }

  function handleMilestoneCta(route: string) {
    void persistAndGo(route, false);
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-4">
        <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-xl shadow-teal-500/30 transition-all duration-500 ${visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          <Rocket className="h-10 w-10 text-white" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center animate-bounce">
          <PartyPopper className="h-4 w-4 text-white" />
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        You&apos;re all set!
      </h2>
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
        Your AI marketing operations team is ready. Here&apos;s where things stand:
      </p>

      <div className={`mt-6 space-y-2 w-full max-w-sm text-left transition-all duration-500 delay-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {milestones === null ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 animate-pulse">
                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                <div className="h-3.5 flex-1 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            ))}
          </>
        ) : (
          milestones.map((m) => (
            <div key={m.key} className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${m.done ? 'bg-teal-100 dark:bg-teal-900/30' : 'bg-slate-200 dark:bg-slate-700'}`}>
                {m.done ? (
                  <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                )}
              </div>
              <span className={`text-sm flex-1 ${m.done ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {m.label}
              </span>
              {m.cta && m.route && (
                <button
                  onClick={() => handleMilestoneCta(m.route!)}
                  disabled={finishing}
                  className="shrink-0 rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {m.cta}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className={`mt-6 flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-900/20 px-5 py-2.5 border border-amber-200 dark:border-amber-800 transition-all duration-500 delay-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <Sparkles className="h-4 w-4 text-amber-500" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Press <kbd className="rounded bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 font-mono text-[10px] font-bold">Cmd+K</kbd> anytime to talk to VIMO
        </p>
      </div>

      {finishError && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400 animate-in fade-in">{finishError}</p>
      )}

      <button
        onClick={handleMeetAgent}
        disabled={finishing}
        className={`mt-6 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 px-10 py-3.5 text-sm font-bold text-white hover:from-teal-600 hover:to-emerald-700 shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 transition-all active:scale-[0.98] disabled:opacity-60 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {finishing ? 'Saving…' : 'Meet your marketing agent'}
      </button>
      <button
        onClick={handleOpen}
        disabled={finishing}
        className="mt-2 inline-flex items-center text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 disabled:opacity-50 transition-colors"
      >
        Open Dashboard
        <ArrowRight className="ml-1 h-3 w-3" />
      </button>
    </div>
  );
}
