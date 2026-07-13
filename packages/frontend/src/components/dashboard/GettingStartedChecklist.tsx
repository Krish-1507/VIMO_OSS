import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowRight, Sparkles } from 'lucide-react';
import api from '../../lib/api';

interface Step {
  key: string;
  label: string;
  done: boolean;
  ctaLabel: string;
  ctaRoute: string;
}

const INITIAL: Step[] = [
  { key: 'brand', label: 'Create your brand profile', done: false, ctaLabel: 'Create brand', ctaRoute: '/brand' },
  { key: 'social', label: 'Connect a social account', done: false, ctaLabel: 'Connect', ctaRoute: '/connector-hub' },
  { key: 'post', label: 'Publish your first post', done: false, ctaLabel: 'Create post', ctaRoute: '/content' },
];

export default function GettingStartedChecklist() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [brandRes, socialRes, postsRes] = await Promise.all([
        api.get('/api/brand-profiles').catch(() => ({ data: [] as any[] })),
        api.get('/api/social-accounts/connected').catch(() => ({ data: { platforms: [] as any[] } })),
        api.get('/api/scheduled-posts').catch(() => ({ data: [] as any[] })),
      ]);

      const brandCreated = (brandRes.data?.length || 0) > 0;
      const platforms = socialRes.data?.platforms || socialRes.data || [];
      const socialConnected = (platforms.length || 0) > 0;
      const firstPost = (postsRes.data?.length || 0) > 0;

      setSteps((prev) =>
        prev.map((s) => ({
          ...s,
          done:
            s.key === 'brand' ? brandCreated : s.key === 'social' ? socialConnected : firstPost,
        })),
      );
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const allDone = steps.every((s) => s.done);
  if (loading || allDone) return null;

  const remaining = steps.filter((s) => !s.done).length;

  return (
    <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 p-5 dark:border-teal-800 dark:from-teal-950/30 dark:to-emerald-950/20">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Your first 3 steps
        </h3>
        <span className="ml-auto text-[11px] font-medium text-teal-700 dark:text-teal-300">
          {remaining} to go
        </span>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.key}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2.5 dark:bg-slate-800/50"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
              )}
              <span
                className={`text-sm truncate ${
                  step.done
                    ? 'text-slate-400 line-through dark:text-slate-500'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {step.label}
              </span>
            </div>
            {!step.done && (
              <button
                onClick={() => navigate(step.ctaRoute)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition-colors"
              >
                {step.ctaLabel}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
