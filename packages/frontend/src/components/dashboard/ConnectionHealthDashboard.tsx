import { useEffect, useState, useCallback } from 'react';
import {
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Music,
  PinIcon,
  Globe,
  Twitter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Link2Off,
  Activity,
} from 'lucide-react';

export interface ConnectionHealth {
  platform: string;
  name: string;
  connected: boolean;
  followers: number;
  health: 'good' | 'warning' | 'error' | 'disconnected';
  reason: string | null;
  lastError: string | null;
  connectorStatus?: string;
  healthScore?: number;
  circuitState?: string;
  consecutiveFailures?: number;
  canReconnect: boolean;
}

interface HealthResponse {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  connectionCount: number;
  connectedCount: number;
  connections: ConnectionHealth[];
}

const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: Music,
  pinterest: PinIcon,
  bluesky: Globe,
  reddit: Globe,
  x: Twitter,
  twitter: Twitter,
};

const PLATFORM_BRAND: Record<string, string> = {
  instagram: 'from-pink-500 to-purple-600',
  facebook: 'from-blue-500 to-blue-700',
  linkedin: 'from-blue-600 to-blue-800',
  youtube: 'from-red-600 to-red-800',
  tiktok: 'from-gray-900 to-rose-400',
  pinterest: 'from-red-500 to-red-700',
  bluesky: 'from-sky-400 to-blue-700',
  reddit: 'from-orange-500 to-orange-700',
  x: 'from-gray-900 to-slate-700',
  twitter: 'from-gray-900 to-slate-700',
};

function healthMeta(health: ConnectionHealth['health']) {
  switch (health) {
    case 'good':
      return { Icon: CheckCircle2, color: 'text-emerald-500', label: 'Healthy', ring: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
    case 'warning':
      return { Icon: AlertTriangle, color: 'text-amber-500', label: 'Degraded', ring: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
    case 'error':
      return { Icon: XCircle, color: 'text-red-500', label: 'Error', ring: 'bg-red-500/10 text-red-600 dark:text-red-400' };
    default:
      return { Icon: Link2Off, color: 'text-slate-400', label: 'Not connected', ring: 'bg-slate-500/10 text-slate-500' };
  }
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export default function ConnectionHealthDashboard({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ platform: string; ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/connections/health`, {
        headers: { 'x-session-token': token },
      });
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const handleReconnect = async (platform: string) => {
    setReconnecting(platform);
    setToast(null);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/connections/${platform}/reconnect`, {
        method: 'POST',
        headers: { 'x-session-token': token },
      });
      const body = await res.json();
      setToast({
        platform,
        ok: !!body.success,
        msg: body.message || body.details || (res.ok ? 'Reconnected.' : 'Reconnect failed.'),
      });
      await load();
      setTimeout(() => setToast(null), 6000);
    } catch (err: any) {
      setToast({ platform, ok: false, msg: err?.message || 'Reconnect failed.' });
      setTimeout(() => setToast(null), 6000);
    } finally {
      setReconnecting(null);
    }
  };

  if (loading && !data) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin text-teal-500" />
          Checking connection health...
        </div>
      </div>
    );
  }

  const overall = data?.overall || 'healthy';
  const overallMeta =
    overall === 'unhealthy'
      ? { text: 'Needs attention', cls: 'text-red-500' }
      : overall === 'degraded'
      ? { text: 'Degraded', cls: 'text-amber-500' }
      : { text: 'All systems healthy', cls: 'text-emerald-500' };

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-teal-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Connection Health
          </h2>
        </div>
        {!compact && (
          <span className={`text-xs font-semibold ${overallMeta.cls}`}>{overallMeta.text}</span>
        )}
      </div>

      {toast && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-xs ${
            toast.ok
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          {toast.ok ? '✓ ' : '✕ '}
          {toast.platform}: {toast.msg}
        </div>
      )}

      {!data || data.connections.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No platforms connected yet. Connect a social account and VIMO will show its live health here.
        </p>
      ) : (
        <div className={compact ? 'space-y-2' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
          {data.connections.map((c) => {
            const Icon = PLATFORM_ICON[c.platform] || Globe;
            const meta = healthMeta(c.health);
            const HealthIcon = meta.Icon;
            const brand = PLATFORM_BRAND[c.platform] || 'from-slate-500 to-slate-700';
            return (
              <div
                key={c.platform}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${brand} text-white`}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {c.platform}
                    </p>
                    <HealthIcon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                  </div>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {c.connected
                      ? `${formatFollowers(c.followers)} followers · ${meta.label}`
                      : c.reason || 'Not connected'}
                  </p>
                  {!compact && c.connected && c.reason && (
                    <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">{c.reason}</p>
                  )}
                </div>

                {c.canReconnect && (
                  <button
                    onClick={() => handleReconnect(c.platform)}
                    disabled={reconnecting === c.platform}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-400"
                  >
                    {reconnecting === c.platform ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Reconnect
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!compact && data && data.connectionCount > 0 && (
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
          VIMO watches every connection and self-heals expired tokens. If a platform can&apos;t be fixed
          automatically, you&apos;ll see a one-click Reconnect here instead of a silent failure.
        </p>
      )}
    </div>
  );
}
