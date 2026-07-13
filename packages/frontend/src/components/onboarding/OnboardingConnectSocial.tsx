import { useState, useEffect } from 'react';
import axios from 'axios';
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

  useEffect(() => {
    axios
      .get('/api/connectors/presets')
      .then((res) => setPresets(res.data.filter((p: Preset) => p.type === 'social')))
      .catch(() => setPresets([]));
  }, []);

  const doConnect = async (preset: Preset) => {
    setConnecting(preset.provider);
    setError(null);
    try {
      const res = await axios.get('/api/auth/oauth/start', {
        params: { provider: preset.provider, connectorId: `${preset.provider}-${Date.now()}` },
      });

      if (res.data.authUrl) {
        const popup = window.open(res.data.authUrl, 'oauth', 'width=600,height=700');
        if (!popup) {
          setError('Popup blocked. Allow popups and try again.');
          setConnecting(null);
          return;
        }
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.success !== undefined) {
            window.removeEventListener('message', handleMessage);
            if (event.data?.success) {
              setConnected((prev) => new Set(prev).add(preset.provider));
            } else {
              setError(event.data?.error || `Couldn't connect ${preset.name}.`);
            }
            setConnecting(null);
          }
        };
        window.addEventListener('message', handleMessage);
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            setConnecting((prev) => (prev === preset.provider ? null : prev));
          }
        }, 1000);
        return;
      }

      // No app credentials configured on this instance yet — let the user
      // finish it later from the Connector Hub instead of blocking onboarding.
      if (res.data.needsSetup) {
        setNeedsSetup((prev) => new Set(prev).add(preset.provider));
        setConnecting(null);
        return;
      }

      setError(`Couldn't start the connection for ${preset.name}.`);
      setConnecting(null);
    } catch {
      setError(`Couldn't start the connection for ${preset.name}.`);
      setConnecting(null);
    }
  };

  const handleConnect = async (preset: Preset) => {
    if (connected.has(preset.provider) || needsSetup.has(preset.provider)) return;
    const hasSeen = localStorage.getItem('oauthReassuranceSeen') === 'true';
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
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Connect your accounts — one click, no keys.</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          VIMO connects on your behalf. Just click a platform, approve in your browser, and you're done — no developer accounts or API keys. You can connect more anytime from the Connector Hub.
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
