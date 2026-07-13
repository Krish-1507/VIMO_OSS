import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import {
  Trash2,
  TestTube,
  Server,
  Package,
  Instagram,
  Linkedin,
  LogIn,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Brain,
  Music,
  Youtube,
  Facebook,
  PinIcon,
  MessageSquare,
  Globe,
  BarChart3,
  Megaphone,
  PenTool,
  CircleDot,
  FileText,
  Twitter,
  Link,
  Shield,
  Lock,
  ChevronDown,
  ChevronRight,
  Clock,
  Film,
} from 'lucide-react';
import { SkeletonList } from '../components/ui/SkeletonCard';
import InfoTooltip from '../components/ui/InfoTooltip';
import FirstTimeCallout from '../components/ui/FirstTimeCallout';
import ConnectorGettingStarted from '../components/connectors/ConnectorGettingStarted';
import GuidedSetupFlow from '../components/connectors/GuidedSetupFlow';
import VisualConnectorBuilder from '../components/connectors/VisualConnectorBuilder';
import ConnectionHealthDashboard from '../components/dashboard/ConnectionHealthDashboard';
import api from '../lib/api';

interface Connector {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: 'active' | 'inactive' | 'error' | 'rate_limited';
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface PresetConnector {
  id: string;
  name: string;
  type: string;
  provider: string;
  description: string;
  category: string;
  iconSlug: string;
  authType: 'api_key' | 'oauth2' | 'oauth2_manual' | 'app_password' | 'none';
  requiredCredentials: {
    key: string;
    label: string;
    placeholder: string;
    isSecret: boolean;
    helpUrl?: string;
    helpText?: string;
  }[];
  tools: { name: string; description: string }[];
  launchStatus?: 'ready' | 'connect-only' | 'coming-soon';
}

interface SetupGuide {
  title: string;
  estimatedMinutes: number;
  steps: {
    stepNumber: number;
    title: string;
    description: string;
    actionUrl?: string;
    screenshotDescription?: string;
    inputField?: { key: string; label: string; placeholder: string; isSecret: boolean };
  }[];
  videoGuideUrl?: string;
}

// Provider category helpers
const MANAGED_PROVIDERS = ['github', 'notion', 'canva', 'linkedin', 'x'];
const GUIDED_PROVIDERS = ['instagram', 'instagram_facebook', 'google', 'google-analytics', 'google-drive', 'youtube', 'google-ads'];
// Providers that require simple API key input
const SIMPLE_CREDENTIAL_PROVIDERS = ['slack', 'slack-mcp', 'hubspot', 'hubspot-native', 'hubspot-mcp', 'bluesky', 'openai', 'anthropic', 'groq'];

function getProviderCategory(preset: PresetConnector): 'managed' | 'guided' | 'simple' | 'llm' {
  if (preset.type === 'llm') return 'llm';

  const p = preset.provider;
  if (MANAGED_PROVIDERS.includes(p)) return 'managed';
  if (GUIDED_PROVIDERS.includes(p)) return 'guided';
  if (SIMPLE_CREDENTIAL_PROVIDERS.includes(p)) return 'simple';

  // Fallback: oauth2 providers with no requiredCredentials = managed
  if (preset.authType === 'oauth2' && preset.requiredCredentials.length === 0) return 'managed';

  // Fallback: oauth2_manual or ones with credentials = guided
  if (preset.authType === 'oauth2_manual' || preset.authType === 'oauth2') return 'guided';

  return 'simple';
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  inactive: 'bg-amber-500',
  error: 'bg-red-500',
  rate_limited: 'bg-orange-500',
};

// ─── Honest readiness badge ────────────────────────────────────────────────
// Surfaces each preset's real launch status so we never over-claim coverage.
const LAUNCH_STATUS_BADGE: Record<
  'ready' | 'connect-only' | 'coming-soon',
  { label: string; className: string }
> = {
  ready: {
    label: 'Ready',
    className:
      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  },
  'connect-only': {
    label: 'Connect only',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  'coming-soon': {
    label: 'Coming soon',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  },
};

function LaunchStatusBadge({ preset }: { preset: PresetConnector }) {
  const status = preset.launchStatus || 'connect-only';
  const meta = LAUNCH_STATUS_BADGE[status];
  return (
    <span
      title={
        status === 'ready'
          ? 'Connect and act end-to-end — works today.'
          : status === 'connect-only'
            ? 'You can connect and pull context/analytics, but automated publishing is not wired up yet.'
            : 'Advertised in the catalog — the connector has not been built yet.'
      }
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

// ─── Platform Branding ──────────────────────────────────────────────────────────

function getBrandIcon(provider: string) {
  const iconMap: Record<string, React.ElementType> = {
    instagram: Instagram,
    linkedin: Linkedin,
    tiktok: Music,
    youtube: Youtube,
    facebook: Facebook,
    pinterest: PinIcon,
    reddit: MessageSquare,
    bluesky: Globe,
    slack: MessageSquare,
    'google-analytics': BarChart3,
    'google-ads': Megaphone,
    'facebook-ads': Megaphone,
    canva: PenTool,
    hubspot: CircleDot,
    notion: FileText,
    x: Twitter,
  };
  return iconMap[provider] || Link;
}

function getBrandColor(provider: string) {
  const colors: Record<string, string> = {
    instagram: 'from-pink-500 to-purple-600',
    linkedin: 'from-blue-600 to-blue-800',
    tiktok: 'from-gray-900 to-rose-400',
    youtube: 'from-red-600 to-red-800',
    facebook: 'from-blue-500 to-blue-700',
    pinterest: 'from-red-500 to-red-700',
    reddit: 'from-orange-500 to-orange-700',
    threads: 'from-gray-800 to-gray-900',
    slack: 'from-purple-500 to-purple-700',
    'google-analytics': 'from-blue-400 to-blue-600',
    'google-ads': 'from-blue-400 to-blue-600',
    'facebook-ads': 'from-blue-500 to-indigo-700',
    canva: 'from-teal-400 to-cyan-600',
    hubspot: 'from-orange-500 to-orange-700',
    mailchimp: 'from-yellow-400 to-yellow-600',
    shopify: 'from-green-500 to-green-700',
    wordpress: 'from-blue-500 to-gray-700',
    medium: 'from-gray-600 to-gray-900',
    notion: 'from-gray-800 to-gray-900',
    x: 'from-gray-900 to-slate-700',
    bluesky: 'from-blue-400 to-blue-700',
    openai: 'from-teal-500 to-emerald-500',
    anthropic: 'from-amber-500 to-orange-600',
    google: 'from-blue-400 to-red-400',
    groq: 'from-purple-500 to-pink-500',
    openrouter: 'from-blue-500 to-purple-600',
    mistral: 'from-red-400 to-red-600',
    ollama: 'from-slate-600 to-slate-800',
    custom: 'from-teal-500 to-emerald-500',
    higgsfield: 'from-violet-500 to-purple-600',
  };
  return colors[provider] || 'from-teal-500 to-emerald-500';
}

function getIconAbbr(name: string) {
  const words = name.split(' ');
  if (words.length >= 2 && words[0].length <= 3) {
    return words[0].toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Connector Status Badge ──────────────────────────────────────────────────────

function ConnectorStatusBadge({ connector }: { connector: Connector }) {
  const provider = connector.provider;
  const isManaged = MANAGED_PROVIDERS.includes(provider);

  if (connector.status === 'active' && isManaged) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <Shield className="h-3 w-3" />
        Managed by VIMO
      </span>
    );
  }

  if (connector.status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Active
      </span>
    );
  }

  if (connector.status === 'error' || connector.status === 'inactive') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertCircle className="h-3 w-3" />
        {connector.status === 'error' ? 'Error' : 'Inactive'}
      </span>
    );
  }

  return <span className="text-xs text-slate-500">{connector.status}</span>;
}

// ─── Main Page Component ─────────────────────────────────────────────────────────

export default function ConnectorsPage() {
  const [activeTab, setActiveTab] = useState<'connected' | 'add-new' | 'plugins'>('connected');
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [presets, setPresets] = useState<PresetConnector[]>([]);
  const [connectableMap, setConnectableMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Setup modal state
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetConnector | null>(null);
  const [setupStep, setSetupStep] = useState<'form' | 'success'>( 'form' );
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  // Guided setup flow
  const [showGuidedFlow, setShowGuidedFlow] = useState(false);
  const [guidedGuide, setGuidedGuide] = useState<SetupGuide | null>(null);
  // OAuth state
  const [oauthConnecting, setOauthConnecting] = useState(false);
  // Slack "show me how" expandable
  const [slackShowHowExpanded, setSlackShowHowExpanded] = useState(false);
  // Instagram verify state
  const [instagramVerifyResult, setInstagramVerifyResult] = useState<{
    accountType: string;
    username: string;
    followersCount: number;
    mediaCount: number;
    canPost: boolean;
    instructions?: string;
  } | null>(null);
  const [verifyingInstagram, setVerifyingInstagram] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customData, setCustomData] = useState({
    name: '',
    serverType: 'remote' as 'remote' | 'npm',
    urlOrPackage: '',
    description: '',
    apiKey: '',
  });

  // Connector Hub: search / filters / multi-account / builder / plugins
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [presetCategories, setPresetCategories] = useState<string[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [pluginForm, setPluginForm] = useState({ name: '', provider: '', description: '', authType: 'api_key' });
  const [pluginActions, setPluginActions] = useState<{ name: string; description: string; method: string; url: string }[]>([]);
  const [pluginSaving, setPluginSaving] = useState(false);

  async function fetchPlugins() {
    try {
      const res = await api.get('/api/plugins');
      setPlugins(res.data?.plugins ?? []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchConnectors();
    fetchPresets();
    fetchConnectableProviders();
    fetchPlugins();
  }, []);

  // Re-fetch presets from the server whenever search/filters change.
  useEffect(() => {
    const t = setTimeout(() => fetchPresets(), 200);
    return () => clearTimeout(t);
  }, [searchTerm, categoryFilter, statusFilter]);

  async function fetchConnectableProviders() {
    try {
      const res = await api.get('/api/auth/oauth/providers');
      const map: Record<string, boolean> = {};
      (res.data?.providers || []).forEach((p: { provider: string; connectable: boolean }) => {
        map[p.provider] = p.connectable;
      });
      setConnectableMap(map);
    } catch {
      // ignore — treat all as guided
    }
  }

  async function fetchConnectors() {
    setIsLoading(true);
    try {
      const res = await api.get('/api/connectors');
      setConnectors(res.data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchPresets() {
    try {
      const res = await api.get('/api/connectors/presets', {
        params: { search: searchTerm, category: categoryFilter, status: statusFilter },
      });
      setPresets(res.data.presets ?? res.data);
      if (Array.isArray(res.data.categories)) setPresetCategories(res.data.categories);
    } catch {
      // ignore
    }
  }

  // Apply search + category + status filters client-side as well (so typing is
  // instant even before the debounced server fetch resolves).
  const [nativePresets, mediaPresets, mcpPresets] = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const match = (p: PresetConnector) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && p.launchStatus !== statusFilter) return false;
      if (term) {
        const hay = `${p.name} ${p.description} ${p.provider} ${p.category}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    };
    const appPresets = presets.filter((p) => p.type !== 'llm' && match(p));
    const media = appPresets.filter((p) => p.type === 'media_generation');
    const native = appPresets.filter(
      (p) => (p as any).connectorArchitecture === 'native' && p.type !== 'media_generation'
    );
    const mcp = appPresets.filter((p) => (p as any).connectorArchitecture === 'mcp');
    return [native, media, mcp];
  }, [presets, searchTerm, categoryFilter, statusFilter]);

  const connectedPresetIds = useMemo(
    () => new Set(connectors.map((c) => c.provider)),
    [connectors]
  );

  // Multi-account: group connectors by provider so several accounts of the same
  // platform (e.g. two Instagram business accounts) show together with an
  // "Add another account" affordance.
  const groupedConnectors = useMemo(() => {
    const map = new Map<string, Connector[]>();
    for (const c of connectors) {
      const arr = map.get(c.provider) || [];
      arr.push(c);
      map.set(c.provider, arr);
    }
    return Array.from(map.entries());
  }, [connectors]);

  function addAnotherAccount(provider: string) {
    const preset = presets.find((p) => p.provider === provider);
    if (preset) handleConnectProvider(preset);
  }

  async function handleRemove(id: string) {
    if (!window.confirm('Are you sure you want to remove this connector?')) return;
    try {
      await api.delete(`/api/connectors/${id}`);
      fetchConnectors();
    } catch {
      // ignore
    }
  }

  async function handleTest(id: string) {
    try {
      await api.post(`/api/connectors/${id}/test`, {});
      alert('Test passed');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Test request failed');
    }
  }

  function openSetup(preset: PresetConnector) {
    setSelectedPreset(preset);
    setSetupStep('form');
    setCredentialValues({});
    setError('');
    setShowGuidedFlow(false);
    setGuidedGuide(null);
    setSlackShowHowExpanded(false);
    setSetupModalOpen(true);
  }

  function closeSetup() {
    setSetupModalOpen(false);
    setSelectedPreset(null);
    setSetupStep('form');
    setCredentialValues({});
    setError('');
    setConnecting(false);
    setOauthConnecting(false);
    setShowGuidedFlow(false);
    setGuidedGuide(null);
    setInstagramVerifyResult(null);
    setVerifyingInstagram(false);
  }

  /* ── Getting Started ── */
  function handleGettingStartedAdd(tab: 'ai' | 'instagram' | 'linkedin') {
    setActiveTab('add-new');
    // Find the preset and open setup
    const targetProvider = tab === 'ai' ? 'openai' : tab === 'instagram' ? 'instagram' : 'linkedin';
    const preset = presets.find((p) => p.provider === targetProvider);
    if (preset) openSetup(preset);
  }

  /* ── MANAGED Providers: Connect ── */
  async function handleManagedConnect(preset: PresetConnector) {
    setOauthConnecting(true);
    setError('');

    try {
      // Use the oauthManager flow (supports hardcoded defaults, DB-stored credentials, and env vars)
      const tempConnectorId = `managed-${preset.provider}-${Date.now()}`;
      const res = await api.get('/api/auth/oauth/start', {
        params: { provider: preset.provider, connectorId: tempConnectorId },
      });

      if (!res.data.authUrl) {
        if (res.data.needsSetup) {
          setError(`${preset.name} needs app credentials. Please configure them in the "App Credentials" section below, then try again.`);
        } else {
          setError(`Failed to get authorization URL for ${preset.name}. Please try again.`);
        }
        setOauthConnecting(false);
        return;
      }

      const authUrl = res.data.authUrl;

      const popup = window.open(authUrl, 'oauth', 'width=600,height=700');
      if (!popup) {
        setError('Popup was blocked. Please allow popups for this site and try again.');
        setOauthConnecting(false);
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.connectorId === tempConnectorId || event.data?.success !== undefined) {
          window.removeEventListener('message', handleMessage);
          if (event.data?.success) {
            setSetupStep('success');
            fetchConnectors();
          } else {
            setError(event.data?.error || 'Connection failed. Please try again.');
          }
          setOauthConnecting(false);
        }
      };

      window.addEventListener('message', handleMessage);

      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          setOauthConnecting((prev) => {
            if (prev) return false;
            return prev;
          });
        }
      }, 1000);

      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        clearInterval(checkClosed);
        setOauthConnecting((prev) => {
          if (prev) {
            setError('Connection timed out. Please try again.');
            return false;
          }
          return prev;
        });
      }, 5 * 60 * 1000);

    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to start connection.';
      setError(msg);
      setOauthConnecting(false);
    }
  }

  /* ── One-click connect (managed + guided OAuth) ──
   * Attempts the real OAuth popup immediately. If VIMO already holds the app
   * credentials this is a true one-click connect (the user only approves in
   * their browser). Otherwise we fall back to the friendly guided setup flow. */
  async function handleConnectProvider(preset: PresetConnector) {
    const category = getProviderCategory(preset);
    if (category !== 'managed' && category !== 'guided') {
      openSetup(preset);
      return;
    }

    setOauthConnecting(true);
    setError('');
    try {
      const res = await api.get('/api/auth/oauth/start', {
        params: { provider: preset.provider, connectorId: `${preset.provider}-${Date.now()}` },
      });

      if (res.data.authUrl) {
        const authUrl = res.data.authUrl;
        const popup = window.open(authUrl, 'oauth', 'width=600,height=700');
        if (!popup) {
          setError('Popup was blocked. Please allow popups for this site and try again.');
          setOauthConnecting(false);
          return;
        }
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.success !== undefined) {
            window.removeEventListener('message', handleMessage);
            if (event.data?.success) {
              setSetupStep('success');
              fetchConnectors();
            } else {
              setError(event.data?.error || 'Connection failed. Please try again.');
            }
            setOauthConnecting(false);
          }
        };
        window.addEventListener('message', handleMessage);
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            setOauthConnecting((prev) => (prev ? false : prev));
          }
        }, 1000);
        setTimeout(() => {
          window.removeEventListener('message', handleMessage);
          clearInterval(checkClosed);
          setOauthConnecting((prev) => {
            if (prev) {
              setError('Connection timed out. Please try again.');
              return false;
            }
            return prev;
          });
        }, 5 * 60 * 1000);
        return;
      }

      if (res.data.needsSetup && res.data.setupGuide) {
        setSelectedPreset(preset);
        setSetupStep('form');
        setCredentialValues({});
        setGuidedGuide(res.data.setupGuide);
        setShowGuidedFlow(true);
        setSetupModalOpen(true);
      } else {
        setError(`Could not start the connection for ${preset.name}. Please try again.`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to start connection.';
      setError(msg);
      // If the provider has no app credentials configured server-side, show the
      // guided setup so the user can supply their own once.
      if (msg?.toLowerCase().includes('oauth is not supported') === false) {
        setSelectedPreset(preset);
        setSetupStep('form');
        setCredentialValues({});
        setSetupModalOpen(true);
      }
    } finally {
      setOauthConnecting(false);
    }
  }

  /* ── GUIDED Providers: Start guided setup ── */
  async function handleGuidedSetup(preset: PresetConnector) {
    setConnecting(true);
    setError('');

    try {
      const res = await api.get('/api/auth/oauth/start', {
        params: { provider: preset.provider, connectorId: `guided-${preset.provider}-${Date.now()}` },
      });

      if (res.data.needsSetup && res.data.setupGuide) {
        setGuidedGuide(res.data.setupGuide);
        setShowGuidedFlow(true);
      } else if (res.data.authUrl) {
        // Already configured — connect
        const popup = window.open(res.data.authUrl, 'oauth', 'width=600,height=700');
        if (popup) {
          const handleMessage = (event: MessageEvent) => {
            if (event.data?.success !== undefined) {
              window.removeEventListener('message', handleMessage);
              if (event.data?.success) {
                setSetupStep('success');
                fetchConnectors();
              } else {
                setError(event.data?.error || 'Connection failed.');
              }
              setConnecting(false);
            }
          };
          window.addEventListener('message', handleMessage);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to start setup.');
    } finally {
      setConnecting(false);
    }
  }

  /* ── Guided Setup Complete callback ── */
  async function handleGuidedComplete(credentials: Record<string, string>) {
    if (!selectedPreset) return;
    try {
      await api.post('/api/connectors', {
        name: selectedPreset.name,
        type: selectedPreset.type,
        provider: selectedPreset.provider,
        status: 'active',
        config: { tools: selectedPreset.tools, serverType: 'builtin' },
        credentials,
      });
      setSetupStep('success');
      fetchConnectors();
      closeSetup(); // Close the guided flow modal
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save connector.');
    }
  }

  /* ── SIMPLE Credential Providers: Connect ── */
  async function handleSimpleConnect() {
    if (!selectedPreset) return;

    for (const cred of selectedPreset.requiredCredentials) {
      if (!credentialValues[cred.key]?.trim()) {
        setError(`Please enter your ${cred.label.toLowerCase()}.`);
        return;
      }
    }

    setConnecting(true);
    setError('');

    try {
      await api.post('/api/connectors', {
        name: selectedPreset.name,
        type: selectedPreset.type,
        provider: selectedPreset.provider,
        status: 'active',
        config: { tools: selectedPreset.tools, serverType: 'builtin' },
        credentials: credentialValues,
      });

      setSetupStep('success');
      fetchConnectors();

      // Instagram verify
      if (selectedPreset.provider === 'instagram') {
        setVerifyingInstagram(true);
        try {
          const verifyRes = await api.get('/api/connectors/instagram/verify');
          setInstagramVerifyResult(verifyRes.data);
        } catch {
          setInstagramVerifyResult(null);
        } finally {
          setVerifyingInstagram(false);
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to connect. Please check your credentials and try again.';
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }

  async function handleCustomConnect() {
    try {
      await api.post('/api/connectors', {
        name: customData.name,
        type: 'custom',
        provider: 'custom',
        status: 'active',
        config: {
          serverType: customData.serverType,
          urlOrPackage: customData.urlOrPackage,
          description: customData.description,
        },
        credentials: customData.apiKey ? { apiKey: customData.apiKey } : undefined,
      });
      setCustomModalOpen(false);
      setCustomData({ name: '', serverType: 'remote', urlOrPackage: '', description: '', apiKey: '' });
      fetchConnectors();
    } catch {
      alert('Failed to connect custom connector');
    }
  }

  // ─── RENDER LOGIC ────────────────────────────────────────────────────────────

  const showGettingStarted = !isLoading && activeTab === 'connected' && connectors.length === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Apps & Platforms</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Connect your marketing tools, social media accounts, and external platforms. AI providers are managed in Settings.
        </p>
      </div>

      {/* Central connection health — self-healing, one-click reconnect */}
      <ConnectionHealthDashboard />

      {/* Social Media Notice */}
      <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500">
        <div className="flex items-center space-x-3">
          <div className="flex -space-x-1">
            <Instagram className="h-5 w-5 text-white" />
            <Linkedin className="h-5 w-5 text-white" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">
              Connect external platforms with one click
            </p>
            <p className="text-xs text-white/80">
              Instagram, Facebook, LinkedIn, TikTok, YouTube, Canva, HubSpot, Mailchimp & more
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('connected')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'connected'
              ? 'border-b-2 border-teal-500 text-teal-600 dark:text-teal-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
          }`}
        >
          Connected
        </button>
        <button
          id="tab-add-new"
          onClick={() => setActiveTab('add-new')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'add-new'
              ? 'border-b-2 border-teal-500 text-teal-600 dark:text-teal-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
          }`}
        >
          Add New
          <FirstTimeCallout
            targetSelector="#tab-add-new"
            message="Add your first app connector here to get started."
            storageKey="callout_connector_add_new"
          />
        </button>
        <button
          onClick={() => setActiveTab('plugins')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'plugins'
              ? 'border-b-2 border-teal-500 text-teal-600 dark:text-teal-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
          }`}
        >
          Plugins
        </button>
      </div>

      {/* Connected Tab */}
      {activeTab === 'connected' && (
        <div>
          {isLoading ? (
            <SkeletonList count={3} />
          ) : showGettingStarted ? (
            <ConnectorGettingStarted
              onAddConnector={handleGettingStartedAdd}
              onSkip={() => setActiveTab('add-new')}
            />
          ) : (
            <div className="space-y-6">
              {groupedConnectors.map(([provider, accounts]) => (
                <div key={provider}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-300">
                      {provider} {accounts.length > 1 && (
                        <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                          {accounts.length} accounts
                        </span>
                      )}
                    </h3>
                    <button
                      onClick={() => addAnotherAccount(provider)}
                      className="inline-flex items-center gap-1 rounded-lg border border-teal-200 px-2.5 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-900/30"
                    >
                      <Link className="h-3 w-3" />
                      Add another account
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {accounts.map((connector) => {
                const toolCount = ((connector.config?.tools as []) || []).length;
                const accountLabel = (connector.config as any)?.accountLabel as string | undefined;
                return (
                  <div
                    key={connector.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {accountLabel ? `${connector.name} · ${accountLabel}` : connector.name}
                        </h3>
                        <div className="mt-1">
                          <ConnectorStatusBadge connector={connector} />
                        </div>
                      </div>
                      <span
                        className={`h-3 w-3 rounded-full ${STATUS_COLORS[connector.status] || 'bg-gray-500'}`}
                        title={connector.status}
                      />
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                      <p>{toolCount} tools available</p>
                      <p>Last tested: {connector.updatedAt ? new Date(connector.updatedAt).toLocaleString() : 'Never'}</p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleTest(connector.id)}
                        className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <TestTube className="mr-1 h-3.5 w-3.5" />
                        Test
                      </button>
                      <button
                        onClick={() => handleRemove(connector.id)}
                        className="inline-flex items-center rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add New Tab */}
      {activeTab === 'add-new' && (
        <div className="space-y-10">
          {/* ── Search / filters ── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search connectors…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All categories</option>
                {presetCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">Any status</option>
                <option value="ready">Ready</option>
                <option value="connect-only">Connect only</option>
                <option value="coming-soon">Coming soon</option>
              </select>
            </div>
            <button
              onClick={() => setBuilderOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              <PenTool className="h-4 w-4" />
              Build a connector
            </button>
          </div>

          {/* ── Honest readiness legend ── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Coverage:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-900/40 dark:text-green-300">Ready</span>
              connect &amp; act end-to-end
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Connect only</span>
              connected, but publishing not wired yet
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-400">Coming soon</span>
              not built yet
            </span>
          </div>

          {/* ── Social Platforms Section ── */}
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Social Platforms — Post & Engage</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Connect these to publish content, schedule posts, and monitor engagement.</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1">
                    <Instagram className="h-5 w-5 text-white" />
                    <Linkedin className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">Social & Publishing</span>
                </div>
              </div>
              <div className="p-5 bg-white dark:bg-slate-800">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {nativePresets.map((preset) => {
                    const isConnected = connectedPresetIds.has(preset.provider);
                    const category = getProviderCategory(preset);
                    return (
                      <div
                        key={preset.id}
                        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                              {getIconAbbr(preset.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {preset.name}
                                </h4>
                                <LaunchStatusBadge preset={preset} />
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{preset.description}</p>
                            </div>
                          </div>

                          {/* Connection type indicator */}
                          <div className="mt-2">
                            {category === 'managed' && (
                            <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                              <Lock className="h-3 w-3" />
                              One-click connect
                            </span>
                          )}
                          {category === 'guided' && (
                            connectableMap[preset.provider] ? (
                              <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                                <LogIn className="h-3 w-3" />
                                One-click connect
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3" />
                                Quick setup (5 min)
                              </span>
                            )
                          )}
                          {category === 'simple' && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                              Paste your access token
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {preset.tools.length} tools
                          </span>
                          <button
                            onClick={() => handleConnectProvider(preset)}
                            disabled={isConnected}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              isConnected
                                ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                : 'bg-teal-600 text-white hover:bg-teal-700'
                            }`}
                          >
                            {isConnected ? 'Connected' : 'Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Media & Video Generation Section ── */}
          {mediaPresets.length > 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Media & Video Generation</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Connect video and media generation tools to create AI videos, animations, and visual content.</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Film className="h-5 w-5 text-white" />
                    <span className="text-sm font-medium text-white">Video & Media</span>
                  </div>
                </div>
                <div className="p-5 bg-white dark:bg-slate-800">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {mediaPresets.map((preset) => {
                      const isConnected = connectedPresetIds.has(preset.provider);
                      const category = getProviderCategory(preset);
                      return (
                        <div
                          key={preset.id}
                          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                              {getIconAbbr(preset.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {preset.name}
                                </h4>
                                <LaunchStatusBadge preset={preset} />
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{preset.description}</p>
                            </div>
                          </div>

                          <div className="mt-2">
                            {category === 'managed' && (
                              <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                                <Lock className="h-3 w-3" />
                                One-click connect
                              </span>
                            )}
                            {category === 'guided' && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3" />
                                Quick setup (5 min)
                              </span>
                            )}
                            {category === 'simple' && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                Paste your access key
                              </span>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {preset.tools.length} tools
                            </span>
                            <button
                              onClick={() => handleConnectProvider(preset)}
                              disabled={isConnected}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                isConnected
                                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                  : 'bg-violet-600 text-white hover:bg-violet-700'
                              }`}
                            >
                              {isConnected ? 'Connected' : 'Add'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Intelligence Sources Section ── */}
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Intelligence Sources — Feed VIMO Context</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Connect these to let VIMO understand what is happening in your business and automatically turn it into content.</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-500 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-white" />
                  <span className="text-sm font-medium text-white">Intelligence Context</span>
                </div>
              </div>
              <div className="p-5 bg-white dark:bg-slate-800">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {mcpPresets.map((preset) => {
                    const isConnected = connectedPresetIds.has(preset.provider);
                    const category = getProviderCategory(preset);
                    return (
                      <div
                        key={preset.id}
                        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                              {getIconAbbr(preset.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {preset.name}
                                </h4>
                                <LaunchStatusBadge preset={preset} />
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{preset.description}</p>
                            </div>
                          </div>

                          {/* Connection type indicator */}
                          <div className="mt-2">
                            {category === 'managed' && (
                            <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                              <Lock className="h-3 w-3" />
                              One-click connect
                            </span>
                          )}
                          {category === 'guided' && (
                            connectableMap[preset.provider] ? (
                              <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                                <LogIn className="h-3 w-3" />
                                One-click connect
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3" />
                                Quick setup (5 min)
                              </span>
                            )
                          )}
                          {category === 'simple' && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                              Paste your access token
                            </span>
                          )}
                        </div>

                        {(preset as any).workflows && (preset as any).workflows.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Enables:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(preset as any).workflows.map((wf: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                                  title={wf.description}
                                >
                                  {wf.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {preset.tools.length} tools
                          </span>
                          <button
                            onClick={() => handleConnectProvider(preset)}
                            disabled={isConnected}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              isConnected
                                ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                          >
                            {isConnected ? 'Connected' : 'Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Custom Connected Tool Card */}
          <div
            onClick={() => setCustomModalOpen(true)}
            className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-teal-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-500 dark:hover:bg-slate-800"
          >
            <Server className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
            <h4 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Custom Connected Tool
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Connect to a custom tool or npm package
            </p>
          </div>
        </div>
      )}

      {/* Plugins Tab — register & manage custom plugins via the Plugin API */}
      {activeTab === 'plugins' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Register a Plugin</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Plugins extend VIMO with new connectors. Register a name, provider, auth type, and the actions it exposes.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={pluginForm.name}
                onChange={(e) => setPluginForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Plugin name (e.g. Acme CRM)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
              <input
                value={pluginForm.provider}
                onChange={(e) => setPluginForm((f) => ({ ...f, provider: e.target.value }))}
                placeholder="Provider key (e.g. acme)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
              <input
                value={pluginForm.description}
                onChange={(e) => setPluginForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
              <select
                value={pluginForm.authType}
                onChange={(e) => setPluginForm((f) => ({ ...f, authType: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="api_key">API key</option>
                <option value="oauth2">OAuth 2.0</option>
                <option value="none">No auth</option>
              </select>
            </div>

            {/* Action builder rows */}
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Actions</div>
              <div className="space-y-2">
                {pluginActions.map((a, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700 sm:grid-cols-4">
                    <input value={a.name} onChange={(e) => setPluginActions((prev) => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="action name" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                    <input value={a.method} onChange={(e) => setPluginActions((prev) => prev.map((x, i) => i === idx ? { ...x, method: e.target.value } : x))} placeholder="GET/POST" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                    <input value={a.url} onChange={(e) => setPluginActions((prev) => prev.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))} placeholder="https://…" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                    <button onClick={() => setPluginActions((prev) => prev.filter((_, i) => i !== idx))} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">Remove</button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setPluginActions((prev) => [...prev, { name: '', description: '', method: 'GET', url: '' }])}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                + Add action
              </button>
            </div>

            <button
              disabled={pluginSaving || !pluginForm.name || !pluginForm.provider}
              onClick={async () => {
                setPluginSaving(true);
                try {
                  await api.post('/api/plugins/register', {
                    ...pluginForm,
                    actions: pluginActions.filter((a) => a.name).map((a) => ({ ...a, description: a.name })),
                  });
                  setPluginForm({ name: '', provider: '', description: '', authType: 'api_key' });
                  setPluginActions([]);
                  fetchPlugins();
                } finally {
                  setPluginSaving(false);
                }
              }}
              className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {pluginSaving ? 'Registering…' : 'Register Plugin'}
            </button>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Registered Plugins</h3>
            {plugins.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No plugins registered yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plugins.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">{p.name}</h4>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{p.provider}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{p.description}</p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{(p.actions || []).length} actions</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={async () => { await api.post(`/api/plugins/${p.id}/install`); fetchConnectors(); }}
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
                      >
                        Install
                      </button>
                      <button
                        onClick={async () => { await api.delete(`/api/plugins/${p.id}`); fetchPlugins(); }}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── App Credentials ── */}
      {activeTab === 'add-new' && (
        <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
          <OAuthCredentialsSection />
        </div>
      )}

      {/* ────────────────────────────────────────────────────── */}
      {/* Unified Branded Setup Modal — Provider-Type-Aware      */}
      {/* ────────────────────────────────────────────────────── */}
      {setupModalOpen && selectedPreset && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 sm:pt-20 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>

            {setupStep === 'form' && (
              <>
                {/* Branded Header */}
                <div className={`bg-gradient-to-r ${getBrandColor(selectedPreset.provider)} p-6 text-center relative`}>
                  <button
                    onClick={closeSetup}
                    className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
                    {React.createElement(getBrandIcon(selectedPreset.provider), { className: 'h-8 w-8 text-white' })}
                  </div>
                  <h2 className="text-xl font-bold text-white">Connect to {selectedPreset.name}</h2>
                  <p className="text-sm text-white/80 mt-1">{selectedPreset.description}</p>
                </div>

                <div className="p-6 space-y-4">
                  {getProviderCategory(selectedPreset) === 'managed' && (
                    /* ── MANAGED PROVIDERS: One-click Connect ── */
                    <ConnectorManagedSetup
                      preset={selectedPreset}
                      error={error}
                      oauthConnecting={oauthConnecting}
                      onConnect={() => handleManagedConnect(selectedPreset)}
                      onClose={closeSetup}
                    />
                  )}

                  {getProviderCategory(selectedPreset) === 'guided' && !showGuidedFlow && (
                    /* ── GUIDED PROVIDERS: Setup Guide Card ── */
                    <ConnectorGuidedSetupCard
                      preset={selectedPreset}
                      error={error}
                      connecting={connecting}
                      onStartGuide={() => handleGuidedSetup(selectedPreset)}
                      onClose={closeSetup}
                    />
                  )}

                  {getProviderCategory(selectedPreset) === 'guided' && showGuidedFlow && guidedGuide && (
                    /* ── GUIDED SETUP FLOW ── */
                    <GuidedSetupFlow
                      guide={guidedGuide}
                      provider={selectedPreset.provider}
                      onComplete={handleGuidedComplete}
                      onClose={closeSetup}
                    />
                  )}

                  {getProviderCategory(selectedPreset) === 'simple' && (
                    /* ── SIMPLE CREDENTIAL PROVIDERS: Input Fields ── */
                    <ConnectorSimpleSetup
                      preset={selectedPreset}
                      credentialValues={credentialValues}
                      error={error}
                      connecting={connecting}
                      slackShowHowExpanded={slackShowHowExpanded}
                      onSlackToggleHow={() => setSlackShowHowExpanded(!slackShowHowExpanded)}
                      onCredentialChange={(key, val) => {
                        setCredentialValues((prev) => ({ ...prev, [key]: val }));
                        setError('');
                      }}
                      onConnect={handleSimpleConnect}
                      onClose={closeSetup}
                    />
                  )}

                  {getProviderCategory(selectedPreset) === 'llm' && (
                    /* ── LLM PROVIDERS: Key Input ── */
                    <ConnectorSimpleSetup
                      preset={selectedPreset}
                      credentialValues={credentialValues}
                      error={error}
                      connecting={connecting}
                      onCredentialChange={(key, val) => {
                        setCredentialValues((prev) => ({ ...prev, [key]: val }));
                        setError('');
                      }}
                      onConnect={handleSimpleConnect}
                      onClose={closeSetup}
                    />
                  )}
                </div>
              </>
            )}

            {setupStep === 'success' && (
              <ConnectorSuccessView
                preset={selectedPreset}
                instagramVerifyResult={instagramVerifyResult}
                verifyingInstagram={verifyingInstagram}
                onClose={closeSetup}
              />
            )}
          </div>
        </div>
      )}

      {/* Custom Connector Modal */}
      {customModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Custom Connected Tool
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Connector Name
                </label>
                <input
                  type="text"
                  value={customData.name}
                  onChange={(e) => setCustomData((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Server Type
                </label>
                <div className="mt-1 flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="serverType"
                      value="remote"
                      checked={customData.serverType === 'remote'}
                      onChange={() => setCustomData((prev) => ({ ...prev, serverType: 'remote' }))}
                    />
                    <Server className="h-4 w-4" />
                    Remote Server URL
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="serverType"
                      value="npm"
                      checked={customData.serverType === 'npm'}
                      onChange={() => setCustomData((prev) => ({ ...prev, serverType: 'npm' }))}
                    />
                    <Package className="h-4 w-4" />
                    npm Package
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {customData.serverType === 'remote' ? 'Server URL' : 'Package Name'}
                </label>
                <input
                  type="text"
                  value={customData.urlOrPackage}
                  onChange={(e) => setCustomData((prev) => ({ ...prev, urlOrPackage: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <input
                  type="text"
                  value={customData.description}
                  onChange={(e) => setCustomData((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Access Key (if required)
                </label>
                <input
                  type="password"
                  value={customData.apiKey}
                  onChange={(e) => setCustomData((prev) => ({ ...prev, apiKey: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setCustomModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCustomConnect}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                Test & Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Connector Builder */}
      <VisualConnectorBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onCreated={() => {
          fetchConnectors();
          fetchPresets();
        }}
      />
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────────────── */

function ConnectorManagedSetup({
  preset,
  error,
  oauthConnecting,
  onConnect,
  onClose,
}: {
  preset: PresetConnector;
  error: string;
  oauthConnecting: boolean;
  onConnect: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
        <Lock className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
        <p className="text-sm text-teal-700 dark:text-teal-300">
          Secure connection. VIMO handles the authorization. You just click Allow.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={onConnect}
        disabled={oauthConnecting}
        className={`w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all ${getBrandColor(preset.provider)} bg-gradient-to-r hover:shadow-lg`}
      >
        {oauthConnecting ? (
          <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Opening authorization...</>
        ) : (
          <><LogIn className="h-4 w-4" /> Connect with {preset.name}</>
        )}
      </button>

      <div className="flex justify-center">
        <button
          onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConnectorGuidedSetupCard({
  preset,
  error,
  connecting,
  onStartGuide,
  onClose,
}: {
  preset: PresetConnector;
  error: string;
  connecting: boolean;
  onStartGuide: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Connect {preset.name} — VIMO does the heavy lifting
        </h4>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Normally you'd have to create a developer app and copy keys. With VIMO you
          just approve the connection in your browser — we handle the rest. If your
          instance doesn't have app credentials yet, we'll walk you through the one-time setup.
        </p>
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-500">
          Takes about 5 minutes and only needs to be done once.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={onStartGuide}
        disabled={connecting}
        className={`w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors bg-gradient-to-r ${getBrandColor(preset.provider)}`}
      >
        {connecting ? (
          <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading...</>
        ) : (
          <><ExternalLink className="h-4 w-4" /> Start setup guide</>
        )}
      </button>

      <div className="flex justify-center">
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConnectorSimpleSetup({
  preset,
  credentialValues,
  error,
  connecting,
  slackShowHowExpanded,
  onSlackToggleHow,
  onCredentialChange,
  onConnect,
  onClose,
}: {
  preset: PresetConnector;
  credentialValues: Record<string, string>;
  error: string;
  connecting: boolean;
  slackShowHowExpanded?: boolean;
  onSlackToggleHow?: () => void;
  onCredentialChange: (key: string, value: string) => void;
  onConnect: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Enter your credentials to link your {preset.name} account. All credentials are encrypted at rest.
      </p>

      {preset.requiredCredentials.map((cred) => (
        <div key={cred.key}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {cred.label}
            <InfoTooltip content={`This credential lets VIMO talk to ${preset.name} on your behalf. It is stored encrypted and never shared.`} />
            {cred.helpUrl && (
              <a
                href={cred.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 text-xs text-teal-500 hover:text-teal-600"
              >
                <ExternalLink className="h-3 w-3" />
                Get token
              </a>
            )}
          </label>
          {cred.helpText && (
            <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{cred.helpText}</p>
          )}
          <input
            type={cred.isSecret ? 'password' : 'text'}
            placeholder={cred.placeholder}
            value={credentialValues[cred.key] || ''}
            onChange={(e) => onCredentialChange(cred.key, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConnect()}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
            autoFocus
          />
        </div>
      ))}

      {/* Slack-specific: "Show me how" expandable */}
      {preset.provider === 'slack' && onSlackToggleHow && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={onSlackToggleHow}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
          >
            <span>Show me how</span>
            {slackShowHowExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {slackShowHowExpanded && (
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-400 list-decimal list-inside">
                <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline dark:text-teal-400">api.slack.com/apps</a> and click "Create New App"</li>
                <li>Choose "From scratch", name it "VIMO Bot" and select your workspace</li>
                <li>Go to "Permissions" and add Bot Token Scopes: <code className="bg-slate-100 px-1 rounded dark:bg-slate-700">channels:history</code>, <code className="bg-slate-100 px-1 rounded dark:bg-slate-700">channels:read</code>, <code className="bg-slate-100 px-1 rounded dark:bg-slate-700">chat:write</code>, <code className="bg-slate-100 px-1 rounded dark:bg-slate-700">users:read</code></li>
                <li>Click "Install to Workspace" and "Allow"</li>
                <li>Copy the "Bot User Token" (starts with <code className="bg-slate-100 px-1 rounded dark:bg-slate-700">xoxb-</code>) and paste it above</li>
              </ol>
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900/50">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <strong>Don't want to set up a Slack app?</strong> You can also connect Slack by installing the VIMO Slack app directly. 
                  Click below to install (coming soon).
                </p>
                <button
                  disabled
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white opacity-50 cursor-not-allowed"
                >
                  <MessageSquare className="h-3 w-3" />
                  Install VIMO Slack App
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={onConnect}
        disabled={connecting}
        className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
      >
        {connecting ? (
          <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connecting...</>
        ) : (
          <><LogIn className="h-4 w-4" /> Connect {preset.name}</>
        )}
      </button>

      <div className="flex justify-center">
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConnectorSuccessView({
  preset,
  instagramVerifyResult,
  verifyingInstagram,
  onClose,
}: {
  preset: PresetConnector;
  instagramVerifyResult: any;
  verifyingInstagram: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="bg-gradient-to-r from-green-400 to-emerald-500 p-8 text-center relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white">Connected!</h2>
        <p className="text-sm text-white/80 mt-1">
          {preset.name} has been successfully linked to VIMO.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Platform</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{preset.name}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Tools Available</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{preset.tools.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Status</span>
            <span className="inline-flex items-center gap-1.5 text-green-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Active
            </span>
          </div>
        </div>

        {preset.provider === 'instagram' && verifyingInstagram && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span className="h-4 w-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            Verifying Instagram account...
          </div>
        )}

        {preset.provider === 'instagram' && instagramVerifyResult && !instagramVerifyResult.canPost && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-800 dark:text-red-300">Personal Account Detected</h4>
                <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                  This is a Personal Instagram account. Automated posting requires a Business or Creator account.{' '}
                  <a href="https://help.instagram.com/2358103564437421" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-red-800">
                    How to switch →
                  </a>
                </p>
                {instagramVerifyResult.username && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Your account @{instagramVerifyResult.username} has {instagramVerifyResult.followersCount.toLocaleString()} followers.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {preset.provider === 'instagram' && instagramVerifyResult && instagramVerifyResult.canPost && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Connected! @{instagramVerifyResult.username} ({instagramVerifyResult.followersCount.toLocaleString()} followers).
                </p>
                <p className="text-xs text-green-700 dark:text-green-400">VIMO can post to this account.</p>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 text-center">
          Your agents can now use {preset.name}'s tools to create content and automate workflows.
        </p>

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
        >
          Done
        </button>
      </div>
    </>
  );
}

function OAuthCredentialsSection() {
  const [credentials, setCredentials] = useState<Record<string, {clientId: string; clientSecret: string}>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [expanded, setExpanded] = useState(false);

  const OAUTH_PROVIDER_INFO: Record<string, {name: string; docsUrl: string}> = {
    instagram: { name: 'Instagram/Facebook', docsUrl: 'https://developers.facebook.com/' },
    linkedin: { name: 'LinkedIn', docsUrl: 'https://www.linkedin.com/developers/' },
    github: { name: 'GitHub', docsUrl: 'https://github.com/settings/developers' },
    notion: { name: 'Notion', docsUrl: 'https://www.notion.so/my-integrations' },
    slack: { name: 'Slack', docsUrl: 'https://api.slack.com/apps' },
    canva: { name: 'Canva', docsUrl: 'https://www.canva.com/developers/' },
    google: { name: 'Google', docsUrl: 'https://console.cloud.google.com/apis/credentials' },
  };

  useEffect(() => {
    api.get('/api/settings').then((res) => {
      const raw = res.data.oauthAppCredentials;
      if (raw) {
        try { setCredentials(JSON.parse(raw)); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setSuccess('');
    try {
      await api.post('/api/settings', { key: 'oauthAppCredentials', value: JSON.stringify(credentials) });
      setSuccess('Saved!');
      setTimeout(() => setSuccess(''), 3000);
    } catch { alert('Failed to save.'); }
    finally { setSaving(false); }
  }

  function updateField(provider: string, field: 'clientId' | 'clientSecret', value: string) {
    setCredentials((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] || { clientId: '', clientSecret: '' }), [field]: value },
    }));
  }

  function isConfigured(provider: string): boolean {
    const c = credentials[provider];
    return !!(c?.clientId && c?.clientSecret);
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <LogIn className="h-4 w-4" />
        App Credentials
        <span className="text-xs text-slate-400 dark:text-slate-500">(for guided provider setup)</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Set up your own app connections for each provider. You only need to do this once per provider.
            After saving, you can connect each provider with one click from the Connectors page.
          </p>

          <div className="space-y-3">
            {Object.entries(OAUTH_PROVIDER_INFO).map(([provider, info]) => {
              const configured = isConfigured(provider);
              return (
                <details key={provider} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <summary className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${configured ? 'text-green-600' : 'text-slate-400'}`}>
                        {configured ? '✓' : '○'}
                      </span>
                      {info.name}
                    </div>
                    <a href={info.docsUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="text-xs text-teal-600 hover:text-teal-500 dark:text-teal-400 inline-flex items-center gap-1">
                      Create App <ExternalLink className="h-3 w-3" />
                    </a>
                  </summary>
                  <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 space-y-2">
                    <input type="text" placeholder="App ID"
                      value={credentials[provider]?.clientId || ''}
                      onChange={(e) => updateField(provider, 'clientId', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    <input type="password" placeholder="App Secret"
                      value={credentials[provider]?.clientSecret || ''}
                      onChange={(e) => updateField(provider, 'clientSecret', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                  </div>
                </details>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2">
              {saving ? 'Saving...' : 'Save All Credentials'}
            </button>
            {success && <span className="text-sm text-green-600 dark:text-green-400">{success}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
