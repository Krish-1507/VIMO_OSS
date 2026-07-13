import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import { useBrandStore } from '../../stores/brandStore';
import { Bell, Menu, Check, ExternalLink, AlertTriangle, CheckCircle, XCircle, PartyPopper, TrendingUp, AlertCircle, DollarSign, Award, CheckSquare, Building2, ChevronDown } from 'lucide-react';
import { socket } from '../../lib/socket';
import api from '../../lib/api';
import { isDemoMode } from '../../lib/demoMode';
import DemoBadge from '../demo/DemoBadge';

interface ServerNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: string;
  actionUrl?: string | null;
  createdAt: string;
}

interface ConnectorAlert {
  connectorId: string;
  connectorName: string;
  reason: string;
}

const NOTIF_ICONS: Record<string, React.ElementType> = {
  post_published: CheckCircle,
  post_failed: XCircle,
  campaign_complete: PartyPopper,
  engagement_spike: TrendingUp,
  connector_error: AlertCircle,
  purchase_intent: DollarSign,
  follower_milestone: Award,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Header({ title }: { title: string }) {
  const navigate = useNavigate();
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isPaused, setIsPaused] = useState(false);
  const [serverNotifications, setServerNotifications] = useState<ServerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [connectorAlerts, setConnectorAlerts] = useState<ConnectorAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [approvalCount, setApprovalCount] = useState(0);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const brandSelectorRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  const { profiles: brandProfiles, selectedId: selectedBrandId } = useBrandStore();
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const selectedBrand = brandProfiles.find((bp) => bp.id === selectedBrandId);

  const fetchAll = useCallback(async () => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    await Promise.all([
      fetchSettings(),
      fetchNotifications(),
      fetchApprovalCount(),
      useBrandStore.getState().fetchProfiles(),
    ]);
  }, []);

  useEffect(() => {
    fetchAll();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const handleApprovalRequested = () => fetchApprovalCount();
    const handleApprovalExecuted = () => fetchApprovalCount();
    const handleApprovalRejected = () => fetchApprovalCount();
    socket.on('approval:requested', handleApprovalRequested);
    socket.on('approval:executed', handleApprovalExecuted);
    socket.on('approval:rejected', handleApprovalRejected);

    const onNewNotif = (notif: ServerNotification) => {
      setServerNotifications((prev) => [notif, ...prev].slice(0, 10));
      setUnreadCount((prev) => prev + 1);
    };
    socket.on('notification:new', onNewNotif);

    const onConnectorAttention = (data: { connectorId: string; reason: string }) => {
      setConnectorAlerts((prev) => {
        if (prev.some((a) => a.connectorId === data.connectorId)) return prev;
        return [...prev, { connectorId: data.connectorId, connectorName: data.connectorId.slice(0, 8), reason: data.reason }];
      });
    };
    socket.on('connector:needs_attention', onConnectorAttention);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('approval:requested', handleApprovalRequested);
      socket.off('approval:executed', handleApprovalExecuted);
      socket.off('approval:rejected', handleApprovalRejected);
      socket.off('notification:new', onNewNotif);
      socket.off('connector:needs_attention', onConnectorAttention);
    };
  }, [fetchAll]);

  // Close notification panel and brand picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
      if (brandSelectorRef.current && !brandSelectorRef.current.contains(e.target as Node)) {
        setShowBrandPicker(false);
      }
    }
    if (showNotifPanel || showBrandPicker) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showNotifPanel, showBrandPicker]);

  async function fetchSettings() {
    try {
      const res = await api.get('/api/settings');
      setIsPaused(res.data.agentsPaused === 'true');
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  }

  async function fetchNotifications() {
    try {
      const res = await api.get('/api/notifications');
      setServerNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    try {
      await api.post('/api/notifications/read-all');
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  async function fetchApprovalCount() {
    try {
      const res = await api.get('/api/approvals/queue/count');
      setApprovalCount(res.data.count || 0);
    } catch {
      // ignore
    }
  }

  async function togglePause() {
    const newValue = !isPaused;
    setIsPaused(newValue);
    try {
      await api.post('/api/settings', {
        key: 'agentsPaused',
        value: newValue.toString(),
      });
    } catch (err) {
      console.error('Failed to update pause state', err);
      setIsPaused(!newValue);
    }
  }

  const visibleConnectorAlerts = connectorAlerts.filter((a) => !dismissedAlerts.has(a.connectorId));

  return (
    <div className="sticky top-0 z-30">
      {/* Approval Notification Banner */}
      {approvalCount > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 border-b border-indigo-200 px-4 sm:px-6 py-2 dark:bg-indigo-950/30 dark:border-indigo-900/50">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
              You have {approvalCount} item{approvalCount > 1 ? 's' : ''} waiting for your approval.
            </span>
          </div>
          <button
            onClick={() => navigate('/approvals')}
            className="flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 dark:text-indigo-300"
          >
            Review <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Connector Health Banner */}
      {visibleConnectorAlerts.map((alert) => (
        <div
          key={alert.connectorId}
          className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 dark:bg-amber-950/30 dark:border-amber-900/50"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {alert.connectorName} needs attention. {alert.reason}
              </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/connectors?highlight=${alert.connectorId}`)}
              className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900 dark:text-amber-300"
            >
              Fix now <ExternalLink className="h-3 w-3" />
            </button>
            <button
              onClick={() => setDismissedAlerts((prev) => new Set([...prev, alert.connectorId]))}
              className="text-amber-500 hover:text-amber-700 dark:text-amber-400 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-4 sm:px-6 lg:px-8 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-6">
          <button
            onClick={() => setMobileSidebarOpen(!isMobileSidebarOpen)}
            className="lg:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-all"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <img src="/VIMO_logo.png" alt="VIMO" className="h-8 w-auto object-contain sm:h-9" />
            {isDemoMode() && <DemoBadge />}
            {title && title !== 'VIMO' && (
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">/ {title}</span>
            )}
          </div>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-slate-800" />
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Agents</span>
            <button
              onClick={togglePause}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-all ${
                isPaused
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400'
              }`}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${isPaused ? 'bg-amber-500 animate-pulse' : 'bg-teal-500 animate-pulse'}`} />
              {isPaused ? 'Paused' : 'Active'}
            </button>
          </div>

          {brandProfiles.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
              <div className="relative" ref={brandSelectorRef}>
                <button
                  onClick={() => setShowBrandPicker(!showBrandPicker)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="max-w-[120px] truncate">{selectedBrand?.name || 'Select Brand'}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showBrandPicker ? 'rotate-180' : ''}`} />
                </button>
                {showBrandPicker && (
                  <div className="absolute top-full right-0 mt-1 w-48 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 overflow-hidden">
                    {brandProfiles.map((bp) => (
                      <button
                        key={bp.id}
                        onClick={() => { useBrandStore.getState().setSelectedId(bp.id); setShowBrandPicker(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                          bp.id === selectedBrand?.id ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{bp.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 border-r border-slate-200 pr-4 sm:pr-6 dark:border-slate-800">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 sm:px-3 py-1.5 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-slate-500">Socket</span>
              <div
                className={`h-2 w-2 rounded-full shadow-[0_0_8px] ${
                  isConnected
                    ? 'bg-green-500 shadow-green-500/50'
                    : 'bg-red-500 shadow-red-500/50'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-1" ref={notifPanelRef}>
            <button
              onClick={() => {
                setShowNotifPanel(!showNotifPanel);
                if (!showNotifPanel) fetchNotifications();
              }}
              className="relative group rounded-lg p-1.5 sm:p-2 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifPanel && (
              <div className="absolute right-4 top-16 w-80 max-h-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800 z-50">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
                    >
                      <Check className="h-3 w-3" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto max-h-80">
                  {serverNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">
                      No notifications yet
                    </div>
                  ) : (
                    serverNotifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          if (n.actionUrl) navigate(n.actionUrl);
                          setShowNotifPanel(false);
                        }}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/50 border-l-2 ${
                          n.isRead === 'false'
                            ? 'border-l-teal-400 bg-teal-50/30 dark:bg-teal-900/10'
                            : 'border-l-transparent'
                        }`}
                      >
                        <span className="text-base shrink-0">{React.createElement(NOTIF_ICONS[n.type] || Bell, { className: 'h-4 w-4 text-slate-500' })}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{n.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="ml-1 sm:ml-2 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 shadow-sm">
            <div className="h-full w-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
              <span className="text-[9px] sm:text-[10px] font-bold text-teal-600 dark:text-teal-400">JD</span>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
