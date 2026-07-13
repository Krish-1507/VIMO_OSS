import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  Zap,
  BarChart3,
  MessageCircle,
  Calendar,
  TrendingUp,
  AlertCircle,
  PartyPopper,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Music,
  Youtube,
  PinIcon,
  AtSign,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSocialAccountsStore } from '../store';
import type { SocialAccount, SocialPlatform } from '../types';
import GuidedSetupView from '../../connector-packs/components/GuidedSetupView';

const PLATFORM_INFO: { id: SocialPlatform; label: string; icon: React.ElementType; color: string; authUrl?: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'from-pink-500 to-purple-600' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'from-blue-500 to-blue-700' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'from-blue-600 to-blue-800' },
  { id: 'x', label: 'X (Twitter)', icon: Twitter, color: 'from-gray-800 to-gray-900' },
  { id: 'tiktok', label: 'TikTok', icon: Music, color: 'from-gray-900 to-rose-500' },
  { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'from-red-600 to-red-800' },
  { id: 'pinterest', label: 'Pinterest', icon: PinIcon, color: 'from-red-500 to-red-700' },
  { id: 'threads', label: 'Threads', icon: AtSign, color: 'from-gray-700 to-gray-900' },
  { id: 'bluesky', label: 'Bluesky', icon: Globe, color: 'from-blue-400 to-blue-600' },
];

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'connect', title: 'Connect Platforms' },
  { id: 'review', title: 'Review' },
  { id: 'complete', title: 'Complete' },
];

export default function VimoSocialSetupAssistant() {
  const {
    isSetupOpen,
    setupStep,
    isLoading,
    accounts,
    selectedAccountIds,
    closeSetup,
    setSetupStep,
    toggleAccountSelection,
    confirmAccountSelection,
    connectPlatform,
    refreshAccounts,
  } = useSocialAccountsStore();

  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set());
  const [connectingPlatforms, setConnectingPlatforms] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showBluesky, setShowBluesky] = useState(false);
  const [guidedSetup, setGuidedSetup] = useState<{
    show: boolean;
    provider: string;
    title?: string;
    setupGuide?: { title: string; estimatedMinutes: number; steps: any[] };
  }>({ show: false, provider: '' });

  useEffect(() => {
    const newConnected = new Set(accounts.filter((a) => a.isConnected).map((a) => a.platform));
    setConnectedPlatforms((prev) => new Set([...prev, ...newConnected]));
  }, [accounts]);

  if (!isSetupOpen) return null;

  const progress = ((setupStep + 1) / STEPS.length) * 100;

  async function handleConnectPlatform(platform: SocialPlatform) {
    if (platform === 'bluesky') {
      setShowBluesky(true);
      return;
    }
    setConnectingPlatforms((prev) => new Set([...prev, platform]));
    setError(null);
    setGuidedSetup({ show: false, provider: '' });

    try {
      await connectPlatform(platform);
    } catch (err: any) {
      if (err?.needsSetup && err?.setupGuide) {
        setGuidedSetup({
          show: true,
          provider: platform,
          title: `Connect ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
          setupGuide: err.setupGuide,
        });
      } else {
        setError(`Failed to connect ${platform}. Please try again.`);
      }
    }
    setConnectingPlatforms((prev) => {
      const next = new Set(prev);
      next.delete(platform);
      return next;
    });
  }

  function handleNext() {
    if (setupStep === 0) {
      setSetupStep(1);
    } else if (setupStep === 1) {
      setSetupStep(2);
      refreshAccounts();
    } else if (setupStep === 2) {
      confirmAccountSelection();
    }
  }

  function handleBack() {
    if (setupStep > 0) setSetupStep(setupStep - 1);
  }

  function handleCredentialsSaved() {
    const savedProvider = guidedSetup.provider;
    setGuidedSetup({ show: false, provider: '' });
    setError(null);
    handleConnectPlatform(savedProvider as SocialPlatform);
  }

  function handleCancelGuidedSetup() {
    setGuidedSetup({ show: false, provider: '' });
  }

  function renderStepContent() {
    if (showBluesky) {
      return <BlueskyForm onConnected={() => { setShowBluesky(false); refreshAccounts(); }} onCancel={() => setShowBluesky(false)} />;
    }
    if (guidedSetup.show && guidedSetup.setupGuide) {
      return (
        <GuidedSetupView
          provider={guidedSetup.provider}
          setupGuide={guidedSetup.setupGuide}
          onCredentialsSaved={handleCredentialsSaved}
          onCancel={handleCancelGuidedSetup}
        />
      );
    }
    switch (setupStep) {
      case 0:
        return <WelcomeStep onContinue={() => setSetupStep(1)} />;
      case 1:
        return (
          <ConnectPlatformsStep
            connectedPlatforms={connectedPlatforms}
            connectingPlatforms={connectingPlatforms}
            onConnect={handleConnectPlatform}
            error={error}
          />
        );
      case 2:
        return (
          <ReviewAccountsStep
            accounts={accounts}
            selectedIds={selectedAccountIds}
            onToggle={toggleAccountSelection}
          />
        );
      case 3:
        return (
          <CompleteStep
            accounts={accounts.filter((a) => selectedAccountIds.includes(a.id))}
            onClose={closeSetup}
          />
        );
      default:
        return null;
    }
  }

  const canProceed = () => {
    if (setupStep === 2) return true;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={closeSetup} />
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-[var(--bg-base)] shadow-modal flex flex-col slide-in-right">
        <div className="relative overflow-hidden px-6 pt-8 pb-6 bg-gradient-to-r from-teal-500 to-emerald-500">
          <button
            onClick={closeSetup}
            className="absolute top-4 right-4 rounded-full p-1.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Connect Your Social Accounts</h2>
              <p className="text-xs text-white/70">
                Step {setupStep + 1} of {STEPS.length}
              </p>
            </div>
          </div>

          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-white/60 mb-1">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/20">
              <div
                className="h-1.5 rounded-full bg-white transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6 animate-in-fade">
            {renderStepContent()}
          </div>
        </div>

        {!guidedSetup.show && setupStep !== 0 && setupStep !== 3 && (
          <div className="border-t border-[var(--border-default)] px-6 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBack}
                disabled={setupStep <= 1 || isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] disabled:opacity-30 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              <button
                onClick={handleNext}
                disabled={!canProceed() || isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working...
                  </>
                ) : setupStep === 1 ? (
                  <>
                    Review Connected Accounts
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Confirm & Complete
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Step 1: Welcome ──────────────────────────────────────────────────── */

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="text-center space-y-8 pt-8">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 shadow-lg shadow-teal-200 dark:shadow-teal-900/30">
        <Sparkles className="h-10 w-10 text-white" />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold text-[var(--text-primary)]">
          Connect Your Social Accounts
        </h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
          VIMO will guide you through connecting each platform. A secure login popup will open for you to authorize VIMO on each platform.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 text-left space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          What you will be able to do
        </p>
        <div className="space-y-2.5">
          {[
            { icon: Zap, label: 'Publish content across platforms' },
            { icon: Calendar, label: 'Schedule posts in advance' },
            { icon: BarChart3, label: 'Track analytics and growth' },
            { icon: MessageCircle, label: 'Respond to comments and messages' },
            { icon: TrendingUp, label: 'Get AI-powered growth recommendations' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bg-overlay)]">
                <item.icon className="h-3.5 w-3.5 text-[var(--teal-500)]" />
              </div>
              <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onContinue}
        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-teal-200 hover:shadow-lg hover:shadow-teal-300 transition-all"
      >
        Get Started
      </button>

      <p className="text-[11px] text-[var(--text-tertiary)]">
        This takes about 2 minutes. A popup will open for each platform you connect.
      </p>
    </div>
  );
}

/* ─── Step 2: Connect Platforms ───────────────────────────────────────── */

function ConnectPlatformsStep({
  connectedPlatforms,
  connectingPlatforms,
  onConnect,
  error,
}: {
  connectedPlatforms: Set<string>;
  connectingPlatforms: Set<string>;
  onConnect: (platform: SocialPlatform) => Promise<void>;
  error: string | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Connect Your Platforms
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Click each platform to open a secure login popup. Log in and authorize VIMO to manage your account.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {PLATFORM_INFO.map((platform) => {
          const isConnected = connectedPlatforms.has(platform.id);
          const isConnecting = connectingPlatforms.has(platform.id);
          const Icon = platform.icon;

          return (
            <button
              key={platform.id}
              onClick={() => !isConnected && !isConnecting && onConnect(platform.id)}
              disabled={isConnecting}
              className={cn(
                'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all',
                isConnected
                  ? 'border-green-200 bg-green-50 dark:bg-green-950/20 cursor-default'
                  : isConnecting
                  ? 'border-[var(--teal-500)] bg-[var(--teal-100)] cursor-wait'
                  : 'border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] cursor-pointer'
              )}
            >
              <div className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
                isConnected ? 'bg-green-500' : `bg-gradient-to-r ${platform.color}`
              )}>
                {isConnected ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  isConnected ? 'text-green-700 dark:text-green-400' : 'text-[var(--text-primary)]'
                )}>
                  {platform.label}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  {isConnected
                    ? 'Connected'
                    : isConnecting
                    ? 'Opening authorization popup...'
                    : platform.id === 'bluesky'
                    ? 'Enter your handle and app password'
                    : 'Click to connect'}
                </p>
              </div>

              {isConnecting && (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--teal-500)] shrink-0" />
              )}
              {!isConnected && !isConnecting && (
                <ExternalLink className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-overlay)] p-4 space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          What happens when you click Connect
        </p>
        <ol className="space-y-1.5 text-xs text-[var(--text-secondary)] list-decimal ml-4">
          <li>A popup window will open for the selected platform</li>
          <li>Log in and authorize VIMO to manage your account</li>
          <li>Close the popup once authorization is complete</li>
          <li>The platform will show as connected here</li>
        </ol>
      </div>
    </div>
  );
}

/* ─── Step 3: Review Connected Accounts ────────────────────────────────── */

function ReviewAccountsStep({
  accounts,
  selectedIds,
  onToggle,
}: {
  accounts: SocialAccount[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Connected Accounts
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {accounts.length > 0
            ? 'These accounts are connected. Select which ones VIMO should manage.'
            : 'No accounts connected yet. Go back and connect at least one platform.'}
        </p>
      </div>

      {accounts.length > 0 ? (
        <div className="space-y-3">
          {accounts.map((account) => {
            const isSelected = selectedIds.includes(account.id);
            const platformInfo = PLATFORM_INFO.find((p) => p.id === account.platform);
            const Icon = platformInfo?.icon || Globe;

            return (
              <button
                key={account.id}
                onClick={() => onToggle(account.id)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all',
                  isSelected
                    ? 'border-[var(--teal-500)] bg-[var(--teal-100)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
                )}
              >
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
                  `bg-gradient-to-r ${platformInfo?.color || 'from-teal-500 to-emerald-500'}`
                )}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {account.name}
                    </p>
                    {account.health === 'warning' && (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    {account.health === 'error' && (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {account.handle || account.platform}
                    {account.followerCount > 0 && ` · ${account.followerCount.toLocaleString()} followers`}
                  </p>
                  {account.healthMessage && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                      {account.healthMessage}
                    </p>
                  )}
                </div>

                <div className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  isSelected
                    ? 'border-[var(--teal-500)] bg-[var(--teal-500)]'
                    : 'border-[var(--border-strong)]'
                )}>
                  {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-6 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No platforms connected yet. Click Back to connect at least one platform.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-overlay)] p-4 space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          VIMO will be able to
        </p>
        <div className="flex flex-wrap gap-2">
          {['Publish posts', 'Schedule content', 'Read analytics', 'Respond to comments'].map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
            >
              <Check className="h-3 w-3 text-green-500" />
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Step 4: Complete ─────────────────────────────────────────────────── */

function CompleteStep({
  accounts,
  onClose,
}: {
  accounts: SocialAccount[];
  onClose: () => void;
}) {
  return (
    <div className="text-center space-y-6 pt-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-green-400 to-emerald-500">
        <PartyPopper className="h-8 w-8 text-white" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-[var(--text-primary)]">
          You are All Set
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected and ready to grow.
        </p>
      </div>

      {accounts.length > 0 && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-3">
          <p className="text-xs font-medium text-[var(--text-secondary)] text-left">
            Connected Platforms
          </p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((account) => {
              const platformInfo = PLATFORM_INFO.find((p) => p.id === account.platform);
              const Icon = platformInfo?.icon || Globe;
              return (
                <div
                  key={account.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white',
                    `bg-gradient-to-r ${platformInfo?.color || 'from-teal-500 to-emerald-500'}`
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {account.name}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 py-2.5 text-sm font-medium text-white hover:shadow-md transition-all"
      >
        Go to Social Dashboard
      </button>

      <button
        onClick={onClose}
        className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Close
      </button>
    </div>
  );
}

/* ─── Bluesky app-password connect ─────────────────────────────────────── */

function BlueskyForm({ onConnected, onCancel }: { onConnected: () => void; onCancel: () => void }) {
  const [handle, setHandle] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { connectBluesky } = useSocialAccountsStore();

  async function submit() {
    if (!handle || !appPassword) {
      setErr('Both your handle and app password are required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await connectBluesky(handle.trim(), appPassword);
      onConnected();
    } catch (e: any) {
      setErr(e?.message || 'Could not connect Bluesky. Check your handle and app password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Connect Bluesky</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Bluesky uses an app password instead. Create one under Settings → Privacy &amp; Security → App Passwords.
        </p>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{err}</p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)]">Handle</label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="yourname.bsky.social"
            className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--teal-500)]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)]">App Password</label>
          <input
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            type="password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--teal-500)]"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:shadow-md disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Connect Bluesky
        </button>
      </div>
    </div>
  );
}
