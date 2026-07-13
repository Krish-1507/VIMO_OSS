/**
 * Social Accounts Dashboard
 * Unified view of all connected social platforms via VIMO Social.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  Unlink,
  Link2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  Calendar,
  Zap,
  Plus,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Music,
  Youtube,
  PinIcon,
  AtSign,
  Globe,
  Eye,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSocialAccountsStore } from '../store';
import type { SocialAccount, SocialPlatform } from '../types';

const PLATFORM_ICONS: Record<SocialPlatform, React.ElementType> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  x: Twitter,
  tiktok: Music,
  youtube: Youtube,
  pinterest: PinIcon,
  threads: AtSign,
  bluesky: Globe,
};

const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  instagram: 'from-pink-500 to-purple-600',
  facebook: 'from-blue-500 to-blue-700',
  linkedin: 'from-blue-600 to-blue-800',
  x: 'from-gray-800 to-gray-900',
  tiktok: 'from-gray-900 to-rose-500',
  youtube: 'from-red-600 to-red-800',
  pinterest: 'from-red-500 to-red-700',
  threads: 'from-gray-700 to-gray-900',
  bluesky: 'from-blue-400 to-blue-600',
};

export default function SocialAccountsPage() {
  const {
    isConnected,
    accounts,
    isLoading,
    openSetup,
    refreshAccounts,
    reconnectAccount,
    disconnectAccount,
  } = useSocialAccountsStore();

  const connectedAccounts = accounts.filter((a) => a.isConnected);
  const totalFollowers = connectedAccounts.reduce((sum, a) => sum + a.followerCount, 0);
  const avgEngagement =
    connectedAccounts.length > 0
      ? connectedAccounts.reduce((sum, a) => sum + a.stats.engagementRate, 0) / connectedAccounts.length
      : 0;

  if (!isConnected) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Social Accounts</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Connect your social platforms once and let VIMO publish, schedule, analyze, and engage automatically.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-overlay)] px-8 py-20">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 shadow-lg shadow-teal-200 dark:shadow-teal-900/30">
            <Zap className="h-10 w-10 text-white" />
          </div>

          <h3 className="text-xl font-bold text-[var(--text-primary)]">
            Connect Your Social Accounts
          </h3>
          <p className="mt-2 max-w-md text-center text-sm text-[var(--text-secondary)]">
            Link your platforms through one simple setup. VIMO will handle publishing, analytics, and engagement for you.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {(['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'pinterest', 'threads', 'bluesky'] as SocialPlatform[]).map(
              (p) => {
                const Icon = PLATFORM_ICONS[p];
                return (
                  <div
                    key={p}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-white',
                      `bg-gradient-to-r ${PLATFORM_COLORS[p]}`
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                );
              }
            )}
          </div>

          <button
            onClick={openSetup}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-teal-200 hover:shadow-lg hover:shadow-teal-300 transition-all"
          >
            <Link2 className="h-4 w-4" />
            Connect Social Accounts
          </button>

          <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
            Takes about 2 minutes. No technical setup required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Social Accounts</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage all your connected platforms in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAccounts}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={openSetup}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-2 text-xs font-medium text-white hover:shadow-md transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Connected Accounts"
          value={connectedAccounts.length.toString()}
          icon={CheckCircle2}
          color="text-green-500"
        />
        <StatCard
          label="Total Followers"
          value={totalFollowers.toLocaleString()}
          icon={Eye}
          color="text-blue-500"
        />
        <StatCard
          label="Avg. Engagement"
          value={`${avgEngagement.toFixed(1)}%`}
          icon={TrendingUp}
          color="text-teal-500"
        />
      </div>

      {/* Account Cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Connected Platforms
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onReconnect={() => reconnectAccount(account.id)}
              onDisconnect={() => disconnectAccount(account.id)}
            />
          ))}
        </div>
      </div>

      {/* Opportunities */}
      {accounts.some((a) => a.health !== 'good') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Opportunities
            </h3>
          </div>
          <div className="space-y-2">
            {accounts
              .filter((a) => a.health !== 'good')
              .map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-800/50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)] capitalize">
                        {account.platform}
                      </p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {account.healthMessage}
                      </p>
                    </div>
                  </div>
                  <button className="text-xs text-[var(--teal-500)] hover:text-[var(--teal-400)] font-medium">
                    Fix
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stat Card ────────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-overlay)]', color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          <p className="text-[11px] text-[var(--text-tertiary)]">{label}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Account Card ─────────────────────────────────────────────────────── */

function AccountCard({
  account,
  onReconnect,
  onDisconnect,
}: {
  account: SocialAccount;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const navigate = useNavigate();
  const refreshAccounts = useSocialAccountsStore((s) => s.refreshAccounts);
  const Icon = PLATFORM_ICONS[account.platform];
  const isConnected = account.isConnected;

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-all',
        isConnected
          ? 'border-[var(--border-default)] bg-[var(--bg-elevated)]'
          : 'border-dashed border-[var(--border-default)] bg-[var(--bg-overlay)] opacity-70'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl text-white',
              `bg-gradient-to-r ${PLATFORM_COLORS[account.platform]}`
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] capitalize">
                {account.platform}
              </h3>
              {account.health === 'warning' && (
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              )}
              {account.health === 'error' && (
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              )}
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {account.name} · {account.followerCount.toLocaleString()} followers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/20 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
              Not connected
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      {isConnected && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          <MiniStat label="Posts" value={account.stats.postsThisMonth.toString()} />
          <MiniStat
            label="Last Post"
            value={
              account.stats.lastPostDaysAgo === null
                ? 'Never'
                : account.stats.lastPostDaysAgo === 0
                ? 'Today'
                : `${account.stats.lastPostDaysAgo}d`
            }
          />
          <MiniStat label="Engagement" value={`${account.stats.engagementRate.toFixed(1)}%`} />
          <MiniStat label="Reach" value={formatReach(account.stats.reach)} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {isConnected ? (
          <>
            <button
              onClick={() => refreshAccounts()}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-overlay)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-colors"
            >
              <BarChart3 className="h-3 w-3" />
              Refresh
            </button>
            <button
              onClick={() => navigate('/content')}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-overlay)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-colors"
            >
              <Calendar className="h-3 w-3" />
              Schedule
            </button>
            <button
              onClick={onDisconnect}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Unlink className="h-3 w-3" />
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={onReconnect}
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white hover:shadow-sm transition-all"
          >
            <Link2 className="h-3 w-3" />
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="text-[10px] text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}

function formatReach(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}
