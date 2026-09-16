import { useState, useEffect, useRef } from 'react';
import api from '../../lib/api';
import { vimoSocialService } from '../../social-accounts/vimoSocialService';
import {
  ArrowRight,
  Instagram,
  Linkedin,
  Music,
  Youtube,
  Facebook,
  Globe,
  Twitter,
  SkipForward,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import OAuthReassuranceModal from './OAuthReassuranceModal';

interface Preset {
  id: string;
  name: string;
  type: string;
  provider: string;
  description: string;
  authType: string;
  requiredCredentials: { key: string; label: string; placeholder: string; isSecret: boolean }[];
}

interface Props {
  onComplete: () => void;
}

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  linkedin: Linkedin,
  tiktok: Music,
  youtube: Youtube,
  facebook: Facebook,
  x: Twitter,
  bluesky: Globe,
  threads: Globe,
  pinterest: Globe,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'from-pink-500 to-purple-600',
  linkedin: 'from-blue-600 to-blue-800',
  tiktok: 'from-gray-900 to-rose-400',
  youtube: 'from-red-600 to-red-800',
  facebook: 'from-blue-500 to-blue-700',
  x: 'from-gray-900 to-slate-700',
  bluesky: 'from-blue-400 to-blue-700',
};

export default function OnboardingConnectSocial({ onComplete }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [needsSetup, setNeedsSetup] = useState<Set<string>>(new Set());
  const [showReassurance, setShowReassurance] = useState<string | null>(null);
  const [pendingConnect, setPendingConnect] = useState<Preset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    api
      .get('/api/connectors/presets')
      .then((res) => {
        if (mountedRef.current) setPresets(res.data.filter((p: Preset) => p.type === 'social'));
      })
      .catch(() => {
        if (mountedRef.current) setPresets([]);
      });
    return () => {
      mountedRef.current = false;
      // Close any leftover popups / timers if the user leaves mid-connect.
      vimoSocialService.cleanup();
    };
  }, []);

  const doConnect = async (preset: Preset) => {
    if (!mountedRef.current) return;
    setConnecting(preset.provider);
    setError(null);
    try {
      // Start the real handshake on the backend. This either returns an
      // authorization URL (managed/guided providers with credentials saved)
      // or needsSetup (this instance needs a one-time guided setup first —
      // e.g. app-password platforms like Bluesky).
      const init = await vimoSocialService.initiateOAuth(preset.provider);
      if (!mountedRef.current) return;

      if (init.needsSetup) {
        setNeedsSetup((prev) => new Set(prev).add(preset.provider));
        setConnecting(null);
        return;
      }

      // Poll the backend for REAL completion. The old postMessage handshake
      // silently dropped successful connections whenever the popup closed
      // without posting back — the user did everything right and saw nothing.
      const success = await vimoSocialService.openOAuthPopup(preset.provider, init.authUrl, init.connectorId);
      if (!mountedRef.current) return;
      if (success) {
        await vimoSocialService.refreshAccounts();
        if (!mountedRef.current) return;
        setConnected((prev) => new Set(prev).add(preset.provider));
      } else {
        setError(
          `Couldn't finish connecting ${preset.name}. If no popup opened, allow popups for this site and try again.`,
        );
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      // Providers without browser login (Bluesky app password, …) answer 400
      // with needsSetup — route them to the Connector Hub, don't error out.
      if (err?.response?.data?.needsSetup) {
        setNeedsSetup((prev) => new Set(prev).add(preset.provider));
      } else {
        setError(err?.response?.data?.error || `Couldn't start the connection for ${preset.name}.`);
      }
    } finally {
      if (mountedRef.current) setConnecting((prev) => (prev === preset.provider ? null : prev));
    }
  };

  const handleConnect = async (preset: Preset) => {
    if (connected.has(preset.provider) || needsSetup.has(preset.provider)) return;
    let hasSeen = false;
    try {
      hasSeen = localStorage.getItem('oauthReassuranceSeen') === 'true';
    } catch (err) {
      console.warn('[vimo] failed to read reassurance flag:', err);
    }
    if (!hasSeen) {
      setPendingConnect(preset);
      setShowReassurance(preset.name);
      return;
    }
    await doConnect(preset);
  };

  const startPending = async () => {
    const preset = pendingConnect;
    setShowReassurance(null);
    setPendingConnect(null);
    if (preset) await doConnect(preset);
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Connect your accounts</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          VIMO connects on your behalf. Click a platform, approve in your browser, and you&apos;re done — no developer accounts needed. For platforms that need a one-time setup, VIMO guides you through it step by step. Connect more anytime from the Connector Hub.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
        {presets.map((preset) => {
          const Icon = PLATFORM_ICONS[preset.provider] || Globe;
          const gradient = PLATFORM_COLORS[preset.provider] || 'from-teal-500 to-emerald-500';
          const isConnected = connected.has(preset.provider);
          const isNeedsSetup = needsSetup.has(preset.provider);
          const isLoading = connecting === preset.provider;

          return (
            <button
              key={preset.id}
              onClick={() => handleConnect(preset)}
              disabled={isConnected || isNeedsSetup || isLoading}
              className={`relative flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                isConnected
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 text-green-700 dark:text-green-400 cursor-default'
                  : isNeedsSetup
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
              } ${isLoading ? 'opacity-60' : ''}`}
            >
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
              <span>{preset.name}</span>
              {isConnected && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {isNeedsSetup && <ExternalLink className="h-3.5 w-3.5 text-amber-500" />}
              {!isConnected && !isNeedsSetup && !isLoading && <ArrowRight className="h-3.5 w-3.5 text-slate-400" />}
              {isLoading && <span className="h-3.5 w-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-center text-xs text-red-600 dark:text-red-400 max-w-md mx-auto">{error}</p>
      )}

      <div className="flex flex-col items-center gap-3 pt-2">
        {connected.size > 0 && (
          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-4 py-2 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {connected.size} connected
          </div>
        )}
        {needsSetup.size > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-full">
            <ShieldCheck className="h-3.5 w-3.5" />
            {needsSetup.size} can be finished in the Connector Hub
          </div>
        )}
        <button
          onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 px-8 py-3 text-sm font-semibold text-white hover:from-teal-600 hover:to-emerald-700 shadow-lg shadow-teal-500/20 transition-all active:scale-[0.98]"
        >
          {connected.size > 0 ? 'Continue to Dashboard' : 'Skip & Continue'}
          <SkipForward className="h-4 w-4" />
        </button>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          You can always connect more platforms later from the Connector Hub.
        </p>
      </div>

      {showReassurance && (
        <OAuthReassuranceModal
          platform={showReassurance}
          onConfirm={startPending}
          onCancel={() => {
            setShowReassurance(null);
            setPendingConnect(null);
          }}
        />
      )}
    </div>
  );
}
