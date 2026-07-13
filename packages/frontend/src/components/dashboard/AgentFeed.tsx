import { Bot, MessageCircle, BarChart3, AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

export interface ActivityEvent {
  id: string;
  type: 'agent' | 'post' | 'campaign';
  icon: 'robot' | 'message' | 'chart' | 'error' | 'success';
  title: string;
  summary: string;
  timestamp: string;
  campaignId?: string;
}

interface AgentFeedProps {
  events: ActivityEvent[];
}

function ActivityIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'robot':
      return (
        <div className="rounded-full bg-indigo-50 dark:bg-indigo-950/30 p-1.5 text-indigo-600 dark:text-indigo-400">
          <Bot size={16} />
        </div>
      );
    case 'message':
      return (
        <div className="rounded-full bg-amber-50 dark:bg-amber-950/30 p-1.5 text-amber-600 dark:text-amber-400">
          <MessageCircle size={16} />
        </div>
      );
    case 'chart':
      return (
        <div className="rounded-full bg-teal-50 dark:bg-teal-950/30 p-1.5 text-teal-600 dark:text-teal-400">
          <BarChart3 size={16} />
        </div>
      );
    case 'error':
      return (
        <div className="rounded-full bg-red-50 dark:bg-red-950/30 p-1.5 text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
        </div>
      );
    case 'success':
      return (
        <div className="rounded-full bg-green-50 dark:bg-green-950/30 p-1.5 text-green-600 dark:text-green-400">
          <CheckCircle2 size={16} />
        </div>
      );
    default:
      return (
        <div className="rounded-full bg-slate-50 dark:bg-slate-950/30 p-1.5 text-slate-600 dark:text-slate-400">
          <Zap size={16} />
        </div>
      );
  }
}

export function AgentFeed({ events }: AgentFeedProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Zap className="mb-2 h-8 w-8 text-[var(--text-tertiary)]" />
        <p className="text-sm text-[var(--text-secondary)]">No agent activity yet. Start a campaign to see activity here.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[320px] overflow-y-auto pr-1 space-y-4">
      {events.map((event) => {
        let relativeTime = '';
        try {
          relativeTime = formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true });
        } catch (e) {
          relativeTime = 'just now';
        }

        return (
          <div
            key={event.id}
            className="feed-item flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--bg-overlay)] transition-colors duration-150"
          >
            <div className="shrink-0 mt-0.5">
              <ActivityIcon icon={event.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {event.title}
                </p>
                <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 whitespace-nowrap">
                  {relativeTime}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                {event.summary}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export default AgentFeed;
