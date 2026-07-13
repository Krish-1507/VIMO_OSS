import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plug,
  CheckCircle2,
  Sparkles,
  Zap,
  Clock,
  Users,
  BookOpen,
  Radar,
  Palette,
  Star,
  TrendingUp,
  X,
  ArrowRight,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  SOCIAL_ACCOUNTS_PACK,
  KNOWLEDGE_PACKS,
  INTELLIGENCE_PACKS,
  CREATIVE_COMMERCE_PACKS,
  PACK_CATEGORIES,
  POPULAR_PACKS,
  ALL_PACKS,
  type ConnectorPack,
  type PackCategory,
} from '../index';
import SetupAssistant from '../components/SetupAssistant';
import { resolveIcon } from '../components/IconResolver';
import api from '../../lib/api';
import { useSocialAccountsStore } from '../../social-accounts/store';
import VimoSocialSetupAssistant from '../../social-accounts/components/VimoSocialSetupAssistant';
import TryDemoButton from '../../components/demo/TryDemoButton';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  social_accounts: Users,
  knowledge_packs: BookOpen,
  intelligence_packs: Radar,
  creative_commerce: Palette,
};

const CATEGORY_COLORS: Record<string, string> = {
  social_accounts: 'from-teal-500 to-emerald-500',
  knowledge_packs: 'from-purple-500 to-indigo-500',
  intelligence_packs: 'from-amber-500 to-orange-500',
  creative_commerce: 'from-pink-500 to-rose-500',
};

const DIFFICULTY_BADGES: Record<string, string> = {
  Easy: 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400',
  Medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400',
  Hard: 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400',
};

export default function ConnectorHubPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [activePack, setActivePack] = useState<ConnectorPack | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [vimosocialConnected, setVimoSocialConnected] = useState(false);
  const [detailPack, setDetailPack] = useState<ConnectorPack | null>(null);
  const { openSetup: openSocialSetup } = useSocialAccountsStore();

  useEffect(() => {
    fetchConnectors();
  }, []);

  async function fetchConnectors() {
    try {
      const res = await api.get('/api/connectors');
      const connected = new Set<string>();
      res.data.forEach((c: any) => {
        const pack = getPackByProvider(c.provider);
        if (pack) connected.add(pack.id);
      });
      setConnectedIds(connected);
      if (connected.has(SOCIAL_ACCOUNTS_PACK.id)) {
        setVimoSocialConnected(true);
      }
    } catch {
      // ignore
    }
  }

  function getPackByProvider(provider: string) {
    return ALL_PACKS.find((p) => p.provider === provider);
  }

  function matchesSearch(pack: ConnectorPack, query: string): boolean {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      pack.name.toLowerCase().includes(q) ||
      pack.description.toLowerCase().includes(q) ||
      pack.provider.toLowerCase().includes(q)
    );
  }

  function openSetup(pack: ConnectorPack) {
    if (pack.id === SOCIAL_ACCOUNTS_PACK.id) {
      if (vimosocialConnected) {
        navigate('/social-accounts');
      } else {
        openSocialSetup();
      }
      return;
    }
    setActivePack(pack);
    setIsAssistantOpen(true);
  }

  async function handleComplete(credentials: Record<string, string>, discoveryItems?: { icon: string; label: string; value: string }[]) {
    if (!activePack) return;
    try {
      // For OAuth-connected packs, the connector may already exist
      const existingConnectors = await api.get('/api/connectors');
      const alreadyConnected = existingConnectors.data.some(
        (c: any) => c.provider === activePack.provider && c.status === 'active'
      );

      if (!alreadyConnected) {
        await api.post('/api/connectors', {
          name: activePack.name,
          type: activePack.category === 'knowledge_packs' ? 'productivity' : 'analytics',
          provider: activePack.provider,
          status: 'active',
          config: { tools: [], serverType: 'builtin' },
          credentials,
        });
      }

      // Register the pack installation so the Marketing Director can consume its insights
      await api.post('/api/packs/install', {
        packId: activePack.id,
        packName: activePack.name,
        category: activePack.category,
        discoveryItems,
      });
      setConnectedIds((prev) => new Set([...prev, activePack.id]));
    } catch {
      // Still mark as connected even if registration fails (best-effort)
      setConnectedIds((prev) => new Set([...prev, activePack.id]));
    }
  }

  async function handleUninstall(pack: ConnectorPack) {
    try {
      // Find and delete connectors for this provider
      const connectorsRes = await api.get('/api/connectors');
      const toDelete = connectorsRes.data.filter((c: any) => c.provider === pack.provider);
      for (const conn of toDelete) {
        await api.delete(`/api/connectors/${conn.id}`);
      }
      // Uninstall the pack
      await api.delete('/api/packs/uninstall', {
        params: { packId: pack.id },
      });
    } catch {
      // Best-effort — still remove from UI
    }
    setConnectedIds((prev) => {
      const next = new Set(prev);
      next.delete(pack.id);
      return next;
    });
  }

  // Categorized packs for display
  const getCategoryPacks = (category: PackCategory) => {
    const map: Record<PackCategory, ConnectorPack[]> = {
      social_accounts: [SOCIAL_ACCOUNTS_PACK],
      knowledge_packs: KNOWLEDGE_PACKS,
      intelligence_packs: INTELLIGENCE_PACKS,
      creative_commerce: CREATIVE_COMMERCE_PACKS,
    };
    return map[category] || [];
  };

  const installedPackCount = connectedIds.size;

  return (
    <div className="space-y-8">
      {/* ════════════════════════════════════════════ */}
      {/* HEADER                                      */}
      {/* ════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Pack Marketplace</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Install capabilities for your marketing team. Each pack gives VIMO new superpowers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Plug className="h-4 w-4" />
          <span>{installedPackCount} pack{installedPackCount !== 1 ? 's' : ''} installed</span>
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* ZERO-KEYS CALL OUT                          */}
      {/* ════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 p-5 dark:border-teal-800 dark:from-teal-950/30 dark:to-emerald-950/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Get started with zero keys
              </h2>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                Connect <span className="font-semibold">GitHub</span>, <span className="font-semibold">Notion</span>, and{' '}
                <span className="font-semibold">Canva</span> with a single click — VIMO handles the connection for you, so you never paste a key or fill in settings.
                Not ready yet? Explore a fully working sample brand in the Demo.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <TryDemoButton variant="solid" />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* SEARCH & FILTER                             */}
      {/* ════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search packs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] pl-9 pr-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--teal-500)] focus:ring-1 focus:ring-[var(--teal-500)] transition-all"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <FilterChip
            active={activeFilter === null}
            onClick={() => setActiveFilter(null)}
            label="All Packs"
          />
          {PACK_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id];
            return (
              <FilterChip
                key={cat.id}
                active={activeFilter === cat.id}
                onClick={() => setActiveFilter(activeFilter === cat.id ? null : cat.id)}
                label={cat.label}
                icon={Icon}
              />
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* INSTALLED SECTION                           */}
      {/* ════════════════════════════════════════════ */}
      {installedPackCount > 0 && !activeFilter && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Installed Packs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ALL_PACKS.filter((p) => connectedIds.has(p.id) && matchesSearch(p, searchQuery)).map((pack) => (
              <InstalledPackCard
                key={pack.id}
                pack={pack}
                onOpen={() => {
                  if (pack.id === SOCIAL_ACCOUNTS_PACK.id) {
                    navigate('/social-accounts');
                  } else {
                    setDetailPack(pack);
                  }
                }}
                onRemove={() => handleUninstall(pack)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* POPULAR PACKS                               */}
      {/* ════════════════════════════════════════════ */}
      {!activeFilter && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Popular Packs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {POPULAR_PACKS.filter((p) => !connectedIds.has(p.id) && matchesSearch(p, searchQuery)).map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                isConnected={connectedIds.has(pack.id)}
                onInstall={() => openSetup(pack)}
                onDetail={() => setDetailPack(pack)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* CATEGORY SECTIONS                           */}
      {/* ════════════════════════════════════════════ */}
      {PACK_CATEGORIES.filter((cat) => !activeFilter || activeFilter === cat.id).map((category) => {
        const packs = getCategoryPacks(category.id as PackCategory);
        const availablePacks = packs.filter((p) => !connectedIds.has(p.id) && matchesSearch(p, searchQuery));
        const connectedPacks = packs.filter((p) => connectedIds.has(p.id) && matchesSearch(p, searchQuery));
        
        // If filtering by this category, show all. If no filter, only show non-installed
        const displayPacks = activeFilter || searchQuery ? packs.filter((p) => matchesSearch(p, searchQuery)) : availablePacks;
        if (displayPacks.length === 0 && connectedPacks.length === 0) return null;

        const Icon = CATEGORY_ICONS[category.id] || Plug;

        return (
          <section key={category.id}>
            <div className="mb-3 flex items-center gap-2">
              <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-white', `bg-gradient-to-r ${CATEGORY_COLORS[category.id]}`)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">{category.label}</h2>
              <p className="hidden sm:block text-xs text-[var(--text-tertiary)]">— {category.description}</p>
              {connectedPacks.length > 0 && (
                <span className="ml-auto text-[11px] text-green-600 dark:text-green-400">
                  {connectedPacks.length} installed
                </span>
              )}
            </div>

            {displayPacks.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayPacks.map((pack) => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    isConnected={connectedIds.has(pack.id)}
                    onInstall={() => openSetup(pack)}
                    onDetail={() => setDetailPack(pack)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* ════════════════════════════════════════════ */}
      {/* SETUP ASSISTANT (Knowledge Sources / Packs) */}
      {/* ════════════════════════════════════════════ */}
      {activePack && activePack.id !== SOCIAL_ACCOUNTS_PACK.id && (
        <SetupAssistant
          pack={activePack}
          isOpen={isAssistantOpen}
          onClose={() => {
            setIsAssistantOpen(false);
            setActivePack(null);
          }}
          onComplete={handleComplete}
        />
      )}

      <VimoSocialSetupAssistant />

      {/* ════════════════════════════════════════════ */}
      {/* PACK DETAIL MODAL                           */}
      {/* ════════════════════════════════════════════ */}
      {detailPack && (
        <PackDetailModal
          pack={detailPack}
          isConnected={connectedIds.has(detailPack.id)}
          onInstall={() => {
            setDetailPack(null);
            openSetup(detailPack);
          }}
          onClose={() => setDetailPack(null)}
        />
      )}
    </div>
  );
}

/* ─── Filter Chip ──────────────────────────────────────────────────────── */

function FilterChip({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all border',
        active
          ? 'border-[var(--teal-500)] bg-[var(--teal-100)] text-[var(--teal-900)] dark:bg-teal-900/30 dark:text-teal-300'
          : 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/* ─── Pack Card ────────────────────────────────────────────────────────── */

function PackCard({
  pack,
  isConnected,
  onInstall,
  onDetail,
}: {
  pack: ConnectorPack;
  isConnected: boolean;
  onInstall: () => void;
  onDetail: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-[var(--bg-elevated)] p-4 transition-all hover:shadow-card cursor-pointer',
        isConnected
          ? 'border-green-200 dark:border-green-900/30'
          : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
      )}
      onClick={onDetail}
    >
      {/* Status badge */}
      <div className="absolute top-3 right-3">
        {isConnected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/20 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Installed
          </span>
        ) : pack.isPopular ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
            <Star className="h-3 w-3" />
            Popular
          </span>
        ) : null}
      </div>

      {/* Icon & Name */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
            `bg-gradient-to-r ${pack.brandColor}`
          )}
        >
          {React.createElement(resolveIcon(pack.icon), { className: 'h-5 w-5' })}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{pack.name}</h3>
          <p className="text-[11px] text-[var(--text-tertiary)] truncate">{pack.description}</p>
        </div>
      </div>

      {/* What VIMO Learns */}
      {pack.whatVimoLearns.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
            VIMO learns
          </p>
          <div className="flex flex-wrap gap-1">
            {pack.whatVimoLearns.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
              >
                {React.createElement(resolveIcon(item.icon), { className: 'h-2.5 w-2.5' })}
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* What VIMO Generates */}
      {pack.whatVimoGenerates.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
            VIMO can generate
          </p>
          <div className="flex flex-wrap gap-1">
            {pack.whatVimoGenerates.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--teal-100)] px-1.5 py-0.5 text-[10px] text-[var(--teal-900)] dark:bg-teal-900/30 dark:text-teal-300"
              >
                {React.createElement(resolveIcon(item.icon), { className: 'h-2.5 w-2.5' })}
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 mb-3">
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
          <Clock className="h-3 w-3" />
          {pack.estimatedSetupTime}
        </span>
        <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium', DIFFICULTY_BADGES[pack.difficulty])}>
          {pack.difficulty}
        </span>
      </div>

      {/* CTA */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onInstall();
        }}
        disabled={isConnected}
        className={cn(
          'w-full rounded-lg py-2 text-xs font-medium transition-all',
          isConnected
            ? 'bg-[var(--bg-overlay)] text-[var(--text-tertiary)] cursor-default'
            : 'text-white hover:shadow-md',
          !isConnected && `bg-gradient-to-r ${pack.brandColor}`
        )}
      >
        {isConnected ? 'Installed' : `Install ${pack.name}`}
      </button>
    </div>
  );
}

/* ─── Installed Pack Card (compact) ────────────────────────────────────── */

function InstalledPackCard({
  pack,
  onOpen,
  onRemove,
}: {
  pack: ConnectorPack;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  return (
    <div className="group relative rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/30 dark:bg-green-950/20">
      <div className="flex items-center gap-3 cursor-pointer" onClick={onOpen}>
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white',
            `bg-gradient-to-r ${pack.brandColor}`
          )}
        >
          {React.createElement(resolveIcon(pack.icon), { className: 'h-4 w-4' })}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{pack.name}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Installed</p>
        </div>
        <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (removing) {
            onRemove();
          } else {
            setRemoving(true);
          }
        }}
        onMouseLeave={() => setRemoving(false)}
        className={cn(
          'mt-2 w-full rounded-lg py-1.5 text-[11px] font-medium transition-all',
          removing
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover:opacity-100'
        )}
      >
        {removing ? 'Confirm Remove' : 'Remove'}
      </button>
    </div>
  );
}

/* ─── Pack Detail Modal ────────────────────────────────────────────────── */

function PackDetailModal({
  pack,
  isConnected,
  onInstall,
  onClose,
}: {
  pack: ConnectorPack;
  isConnected: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-[var(--bg-base)] shadow-modal flex flex-col overflow-y-auto">
        {/* Header */}
        <div className={cn('relative px-6 pt-8 pb-6', `bg-gradient-to-r ${pack.brandColor}`)}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              {React.createElement(resolveIcon(pack.icon), { className: 'h-7 w-7 text-white' })}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{pack.name}</h2>
              <p className="text-sm text-white/80 mt-0.5">{pack.description}</p>
            </div>
          </div>

          {pack.longDescription && (
            <p className="mt-4 text-sm text-white/70 leading-relaxed">{pack.longDescription}</p>
          )}
        </div>

        <div className="flex-1 px-6 py-6 space-y-6">
          {/* Meta info */}
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Clock className="h-3.5 w-3.5" />
              Setup: {pack.estimatedSetupTime}
            </span>
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', DIFFICULTY_BADGES[pack.difficulty])}>
              {pack.difficulty}
            </span>
          </div>

          {/* Requirements */}
          {pack.requirements.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                Requirements
              </h3>
              <div className="space-y-1.5">
                {pack.requirements.map((req) => (
                  <div key={req.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--teal-500)]" />
                    {req.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capabilities */}
          {pack.capabilities.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                Capabilities
              </h3>
              <div className="flex flex-wrap gap-2">
                {pack.capabilities.map((cap) => (
                  <span
                    key={cap.label}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-overlay)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                  >
                    {React.createElement(resolveIcon(cap.icon), { className: 'h-3.5 w-3.5' })}
                    {cap.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* What VIMO Learns */}
          {pack.whatVimoLearns.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                What VIMO learns
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {pack.whatVimoLearns.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 rounded-lg bg-[var(--bg-elevated)] p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-overlay)]">
                      {React.createElement(resolveIcon(item.icon), { className: 'h-4 w-4 text-[var(--teal-500)]' })}
                    </div>
                    <span className="text-xs text-[var(--text-primary)]">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What VIMO Generates */}
          {pack.whatVimoGenerates.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                What VIMO can generate
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {pack.whatVimoGenerates.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 rounded-lg bg-[var(--teal-100)] dark:bg-teal-900/20 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-slate-800">
                      {React.createElement(resolveIcon(item.icon), { className: 'h-4 w-4 text-[var(--teal-500)]' })}
                    </div>
                    <span className="text-xs text-[var(--teal-900)] dark:text-[var(--teal-300)]">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discovered Info (post-connection) */}
          {pack.discoveredInfo && (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-[var(--teal-500)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{pack.discoveredInfo.title}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {pack.discoveredInfo.items.map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-overlay)]">
                      {React.createElement(resolveIcon(item.icon), { className: 'h-4 w-4 text-[var(--teal-500)]' })}
                    </div>
                    <p className="text-lg font-bold text-[var(--text-primary)]">{item.value}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)]">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Actions */}
          {pack.successActions && pack.successActions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                Suggested Actions
              </h3>
              <div className="space-y-2">
                {pack.successActions.map((action) => (
                  <div
                    key={action.label}
                    className="flex items-center justify-between rounded-lg border border-[var(--border-default)] p-3"
                  >
                    <span className="text-sm text-[var(--text-secondary)]">{action.label}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--teal-500)]">
                      {action.cta}
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Example Outputs */}
          {pack.exampleOutputs && pack.exampleOutputs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                Example Outputs
              </h3>
              <div className="space-y-2">
                {pack.exampleOutputs.map((output, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--teal-500)]" />
                    {output}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={onInstall}
            disabled={isConnected}
            className={cn(
              'w-full rounded-xl py-3 text-sm font-semibold text-white transition-all hover:shadow-lg disabled:opacity-40',
              isConnected
                ? 'bg-[var(--bg-overlay)] text-[var(--text-tertiary)] cursor-default'
                : '',
              !isConnected && `bg-gradient-to-r ${pack.brandColor}`
            )}
          >
            {isConnected ? `${pack.name} is installed` : `Install ${pack.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
