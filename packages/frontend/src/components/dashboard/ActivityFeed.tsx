import {
  Search,
  Megaphone,
  PenTool,
  Send,
  MessageCircle,
  Bot,
  Sparkles,
  GraduationCap,
  TrendingUp,
  CheckCircle2,
  CircleDot,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

export interface ActivityItem {
  id: string;
  kind:
    | 'research'
    | 'strategy'
    | 'content'
    | 'publish'
    | 'engagement'
    | 'director'
    | 'autopilot'
    | 'lesson'
    | 'milestone';
  title: string;
  description: string;
  /** Plain-language reason VIMO took (or suggests) this action. */
  why?: string;
  timestamp: string;
  status?: 'done' | 'planned' | 'monitoring';
}

interface Props {
  items: ActivityItem[];
  /** Smaller, scrollable variant for side panels. */
  compact?: boolean;
}

function ActivityIcon({ kind }: { kind: ActivityItem['kind'] }) {
  const wrap = (el: React.ReactNode, cls: string) => (
    <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full ${cls}`}>{el}</div>
  );
  switch (kind) {
    case 'research':
      return wrap(<Search className="h-4 w-4" />, 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400');
    case 'strategy':
      return wrap(<Megaphone className="h-4 w-4" />, 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400');
    case 'content':
      return wrap(<PenTool className="h-4 w-4" />, 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400');
    case 'publish':
      return wrap(<Send className="h-4 w-4" />, 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400');
    case 'engagement':
      return wrap(<MessageCircle className="h-4 w-4" />, 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400');
    case 'milestone':
      return wrap(<GraduationCap className="h-4 w-4" />, 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400');
    case 'lesson':
      return wrap(<TrendingUp className="h-4 w-4" />, 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300');
    case 'autopilot':
      return wrap(<Bot className="h-4 w-4" />, 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400');
    case 'director':
    default:
      return wrap(<Sparkles className="h-4 w-4" />, 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400');
  }
}

function StatusPill({ status }: { status?: ActivityItem['status'] }) {
  if (status === 'planned') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <CircleDot className="h-3 w-3" /> Planned
      </span>
    );
  }
  if (status === 'monitoring') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-medium text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">
        <Bot className="h-3 w-3 animate-pulse" /> Running
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 className="h-3 w-3" /> Done
    </span>
  );
}

export default function ActivityFeed({ items, compact }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Bot className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No activity yet. When VIMO researches, posts, or engages, you&apos;ll see exactly what it did and why — here.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      {items.map((item) => {
        let relativeTime = '';
        try {
          relativeTime = formatDistanceToNow(parseISO(item.timestamp), { addSuffix: true });
        } catch {
          relativeTime = 'just now';
        }
        return (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mt-0.5">
              <ActivityIcon kind={item.kind} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">{relativeTime}</span>
              </div>
              {item.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
              )}
              {item.why && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-teal-50/70 px-2.5 py-1.5 dark:bg-teal-950/20">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-teal-500 dark:text-teal-400" />
                  <p className="text-[11px] leading-snug text-teal-800 dark:text-teal-300">
                    <span className="font-semibold">Why:</span> {item.why}
                  </p>
                </div>
              )}
              {item.status && (
                <div className="mt-1.5">
                  <StatusPill status={item.status} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
