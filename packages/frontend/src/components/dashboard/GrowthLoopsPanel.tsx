import { useState, useEffect, useCallback } from 'react';
import { Zap, CheckCircle2, X, Loader2, RefreshCw, Sparkles, Quote, TrendingUp } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { socket } from '../../lib/socket';
import { useUIStore } from '../../stores/uiStore';
import api from '../../lib/api';

interface GrowthAction {
  id: string;
  sourcePostId: string;
  brandProfileId: string;
  actionType: string;
  description: string;
  status: string;
  createdAt: string;
  sourcePostPreview: string | null;
}

const actionTypeConfig: Record<string, { label: string; color: string; icon: string }> = {
  generate_variation: {
    label: 'Generate Variation',
    color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
    icon: 'sparkles',
  },
  repost_to_platform: {
    label: 'Repost to Platform',
    color: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200 dark:border-teal-800',
    icon: 'refresh',
  },
  create_reel: {
    label: 'Create Reel',
    color: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    icon: 'zap',
  },
  test_stronger_hook: {
    label: 'Test Stronger Hook',
    color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    icon: 'sparkles',
  },
};

function ActionTypeBadge({ actionType }: { actionType: string }) {
  const config = actionTypeConfig[actionType] || {
    label: actionType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    color: 'bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-800',
    icon: 'zap',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.color}`}
    >
      <Zap className="h-3 w-3" />
      {config.label}
    </span>
  );
}

export default function GrowthLoopsPanel() {
  const [actions, setActions] = useState<GrowthAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const addNotification = useUIStore((s) => s.addNotification);

  const fetchActions = useCallback(async () => {
    try {
      const res = await api.get('/api/growth-actions');
      setActions(res.data);
    } catch (err) {
      console.error('[GrowthLoopsPanel] Failed to fetch actions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();

    // Listen for new actions via socket
    const handleNewActions = (data: { actions: GrowthAction[] }) => {
      if (data.actions && data.actions.length > 0) {
        // Prepend new actions
        setActions((prev) => [...data.actions, ...prev]);
      }
    };

    socket.on('growth_loop:actions_created', handleNewActions);
    socket.on('growth_loop:complete', () => {
      // Refresh when growth loop completes
      fetchActions();
    });

    return () => {
      socket.off('growth_loop:actions_created', handleNewActions);
      socket.off('growth_loop:complete');
    };
  }, [fetchActions]);

  const pendingActions = actions.filter((a) => a.status === 'pending' || a.status === 'approved');
  const completedOrFailed = actions.filter(
    (a) => a.status === 'completed' || a.status === 'failed'
  );

  const handleApprove = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await api.post(`/api/growth-actions/${id}/approve`);
      setActions((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'approved' } : a))
      );
      addNotification('success', 'Action Approved', 'Draft posts have been queued for scheduling.');
    } catch (err: any) {
      addNotification('error', 'Approval Failed', err?.response?.data?.message || 'Could not approve action.');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDismiss = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await api.delete(`/api/growth-actions/${id}`);
      setActions((prev) => prev.filter((a) => a.id !== id));
      addNotification('info', 'Action Dismissed', 'The growth action has been dismissed.');
    } catch (err: any) {
      addNotification('error', 'Dismissal Failed', err?.response?.data?.message || 'Could not dismiss action.');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-in fade-in duration-500">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 p-1.5 shadow-sm">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Growth Opportunities</h2>
          {pendingActions.length > 0 && (
            <span className="inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-teal-100 text-[10px] font-bold text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
              {pendingActions.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchActions}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 p-4 dark:from-teal-900/20 dark:to-emerald-900/20">
            <Sparkles className="h-8 w-8 text-teal-500 dark:text-teal-400" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-200 mb-1">
            No growth opportunities detected yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
            VIMO will automatically find high-performing content and suggest follow-up actions.
            Check back after publishing a few posts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pending actions */}
          {pendingActions.map((action) => (
            <div
              key={action.id}
              className="group relative rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:border-teal-300/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-teal-700/50 animate-in slide-in-from-right-2 duration-300"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <ActionTypeBadge actionType={action.actionType} />
                <span className="shrink-0 text-[10px] font-medium text-slate-400">
                  {formatDistanceToNow(parseISO(action.createdAt), { addSuffix: true })}
                </span>
              </div>

              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3 leading-relaxed">
                {action.description}
              </p>

              {action.sourcePostPreview && (
                <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex items-start gap-2">
                    <Quote className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 italic">
                      "{action.sourcePostPreview}{action.sourcePostPreview.length >= 200 ? '...' : ''}"
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApprove(action.id)}
                  disabled={processingIds.has(action.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingIds.has(action.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => handleDismiss(action.id)}
                  disabled={processingIds.has(action.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                  Dismiss
                </button>
              </div>
            </div>
          ))}

          {/* Completed/failed actions collapsed */}
          {completedOrFailed.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors py-2 select-none">
                {completedOrFailed.length} processed action{completedOrFailed.length !== 1 ? 's' : ''}
              </summary>
              <div className="mt-2 space-y-2">
                {completedOrFailed.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ActionTypeBadge actionType={action.actionType} />
                      <span className="text-xs text-slate-500 truncate">{action.description}</span>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase ${
                        action.status === 'completed'
                          ? 'text-teal-600'
                          : 'text-red-500'
                      }`}
                    >
                      {action.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
