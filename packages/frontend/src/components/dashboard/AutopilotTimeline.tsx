import {
  ShieldCheck,
  Search,
  Megaphone,
  PenTool,
  Send,
  MessageCircle,
  Eye,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Bot,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

export type AutopilotTimelineAction =
  | 'validate'
  | 'research'
  | 'strategy'
  | 'content'
  | 'schedule'
  | 'engage'
  | 'monitor'
  | 'checkpoint'
  | 'error';

export interface AutopilotTimelineEntry {
  id: string;
  phase: string;
  action: AutopilotTimelineAction;
  title: string;
  detail?: string;
  why?: string;
  timestamp: string;
  status?: 'done' | 'running' | 'failed';
  metrics?: Record<string, number | string>;
}

const ACTION_META: Record<
  AutopilotTimelineAction,
  { icon: React.ElementType; ring: string; chip: string }
> = {
  validate: { icon: ShieldCheck, ring: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  research: { icon: Search, ring: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400', chip: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
  strategy: { icon: Megaphone, ring: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400', chip: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  content: { icon: PenTool, ring: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400', chip: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' },
  schedule: { icon: Send, ring: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
  engage: { icon: MessageCircle, ring: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', chip: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  monitor: { icon: Eye, ring: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400', chip: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400' },
  checkpoint: { icon: Bot, ring: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400', chip: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400' },
  error: { icon: AlertCircle, ring: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400', chip: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

interface Props {
  timeline: AutopilotTimelineEntry[];
  /** Plain log strings, used as a fallback when no structured timeline exists. */
  fallbackLog?: string[];
  status?: string;
}

export default function AutopilotTimeline({ timeline, fallbackLog, status }: Props) {
  const running = status && ['initializing', 'researching', 'strategizing', 'creating_content', 'scheduling', 'activating_engagement'].includes(status);

  if (!timeline || timeline.length === 0) {
    if (fallbackLog && fallbackLog.length > 0) {
      return (
        <div className="space-y-2">
          {fallbackLog.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="text-teal-500 mt-0.5 shrink-0 text-[10px]">◆</span>
              <span>{entry}</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Bot className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No activity yet. When you start Autopilot you&apos;ll see exactly what VIMO did and why — here, step by step.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-700/60 pl-5">
      {timeline.map((entry, idx) => {
        const meta = ACTION_META[entry.action] || ACTION_META.checkpoint;
        const Icon = meta.icon;
        const isLast = idx === timeline.length - 1;
        const isRunning = running && isLast && entry.status !== 'failed';
        const failed = entry.status === 'failed';
        return (
          <li key={entry.id} className="relative">
            <span
              className={`absolute -left-[27px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-slate-900 ${meta.ring}`}
            >
              {failed ? (
                <AlertCircle className="h-4 w-4" />
              ) : isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-white">{entry.title}</h4>
                {failed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                    Failed
                  </span>
                ) : isRunning ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Running
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Done
                  </span>
                )}
                {entry.timestamp && (
                  <span className="ml-auto text-[10px] text-slate-500">
                    {formatDistanceToNow(parseISO(entry.timestamp), { addSuffix: true })}
                  </span>
                )}
              </div>

              {entry.detail && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300/90">{entry.detail}</p>
              )}

              {entry.metrics && Object.keys(entry.metrics).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(entry.metrics).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded-md bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-200"
                    >
                      {k.replace(/([A-Z])/g, ' $1')}: {String(v)}
                    </span>
                  ))}
                </div>
              )}

              {entry.why && (
                <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-teal-500/10 px-2.5 py-2">
                  <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                  <p className="text-[11px] leading-snug text-teal-100/90">
                    <span className="font-semibold text-teal-300">Why VIMO did this:</span> {entry.why}
                  </p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
