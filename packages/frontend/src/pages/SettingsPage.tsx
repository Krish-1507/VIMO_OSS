import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Bell,
  Database,
  Info,
  Trash2,
  Download,
  AlertTriangle,
  ExternalLink,
  Bot,
  Monitor,
  RefreshCw,
  User,
  Building2,
  Plus,
  X,
  CheckCircle2,
  Pencil,
  AlertCircle,
  Sparkles,
  Dna,
  Globe,
  Loader2,
  Check,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../lib/api';
import { useBrandStore } from '../stores/brandStore';
import EditableDNAResults from '../components/brand/EditableDNAResults';

interface BrandProfile {
  id: string;
  name: string;
  industry: string;
  audience: string;
  website?: string;
  toneKeywords: string[];
  examplePosts: string[];
}

interface Connector {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: string;
  config?: Record<string, any>;
}

interface AuditLog {
  id: string;
  agentName: string;
  action: string;
  status: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

   // Form states
   const [appName, setAppName] = useState('VIMO');
   const [defaultBrandId, setDefaultBrandId] = useState('');
   const [timezone, setTimezone] = useState('UTC');
   const [language, setLanguage] = useState('en');
   const [currentPin, setCurrentPin] = useState('');
   const [newPin, setNewPin] = useState('');
   const [confirmPin, setConfirmPin] = useState('');
   const [resetConfirm, setResetConfirm] = useState('');
   const [showResetDialog, setShowResetDialog] = useState(false);
   const [streamingEnabled, setStreamingEnabled] = useState(false);
   // User profile states
   const [userName, setUserName] = useState('');
   const [userEmail, setUserEmail] = useState('');
    // AI provider management states
    const [llmConnectors, setLlmConnectors] = useState<Connector[]>([]);
    const [llmModelDetails, setLlmModelDetails] = useState<Record<string, string>>({});
    const [mediaConnectors, setMediaConnectors] = useState<Connector[]>([]);
   const [showAddAIProvider, setShowAddAIProvider] = useState(false);
   const [editingAIProvider, setEditingAIProvider] = useState<Connector | null>(null);
   const [aiProviderKey, setAiProviderKey] = useState('');
   const [aiProviderPreset, setAiProviderPreset] = useState('openai');
   const [savingAIProvider, setSavingAIProvider] = useState(false);
   const [aiProviderError, setAiProviderError] = useState('');
   // Custom provider extra fields
   const [aiCustomProviderName, setAiCustomProviderName] = useState('');
   const [aiCustomBaseUrl, setAiCustomBaseUrl] = useState('');
   const [aiCustomModelName, setAiCustomModelName] = useState('');

   // Provider model picker (groq/openrouter)
   const [providerModelOptions, setProviderModelOptions] = useState<string[]>([]);
   const [providerSelectedModel, setProviderSelectedModel] = useState<string>('');
   const [providerModelsLoading, setProviderModelsLoading] = useState(false);
   // Brand profile modal states
    // AI Type selection
    const [aiType, setAiType] = useState('text');
    const [showBrandModal, setShowBrandModal] = useState(false);
    const [editingBrand, setEditingBrand] = useState<BrandProfile | null>(null);
    const [brandFormName, setBrandFormName] = useState('');
    const [brandFormIndustry, setBrandFormIndustry] = useState('');
    const [brandFormAudience, setBrandFormAudience] = useState('');
    const [brandFormTones, setBrandFormTones] = useState<string[]>([]);
    const [brandFormExamples, setBrandFormExamples] = useState<string[]>(['']);
    const [brandFormWebsite, setBrandFormWebsite] = useState('');
    const [savingBrand, setSavingBrand] = useState(false);
    const [generatingWeek, setGeneratingWeek] = useState(false);
    const [generatedWeekResult, setGeneratedWeekResult] = useState<any>(null);
    const [recentlyCreatedBrandId, setRecentlyCreatedBrandId] = useState<string | null>(null);
    const [showGenerateWeekModal, setShowGenerateWeekModal] = useState(false);

   // DNA analysis states
   const [dnaUrl, setDnaUrl] = useState('');
   const [dnaLoading, setDnaLoading] = useState(false);
   const [dnaError, setDnaError] = useState('');
   const [dnaResult, setDnaResult] = useState<any>(null);
   const [showCreatePanel, setShowCreatePanel] = useState(false);
   const [dnaCreateMode, setDnaCreateMode] = useState<'url' | 'manual' | null>(null);

   async function handleAnalyzeDNA() {
     if (!dnaUrl) return;
     setDnaLoading(true);
     setDnaError('');
     setDnaResult(null);
     try {
       const res = await api.post('/api/brand-profiles/analyze-dna', { url: dnaUrl });
       setDnaResult(res.data);
     } catch (err: any) {
       setDnaError(err?.response?.data?.error || 'Analysis failed. Please check the URL and try again.');
     } finally {
       setDnaLoading(false);
     }
   }

   async function handleSaveDNAAsBrand() {
     if (!dnaResult?.dna) return;
     setSavingBrand(true);
     try {
       const dna = dnaResult.dna;
       const payload = {
         name: dna.brandName || 'New Brand',
         industry: dna.industry || dnaResult.website?.pagesCrawled ? 'Website' : '',
         audience: dna.targetAudience || '',
         website: dnaUrl,
         logoUrl: dnaResult.website?.logoUrl || null,
         toneKeywords: [
           ...(dna.toneOfVoice ? dna.toneOfVoice.split(/[,.]/).map((t: string) => t.trim()).filter(Boolean) : []),
           ...(dna.brandValues || []),
         ].filter(Boolean),
         examplePosts: [
           dna.tagline,
           dna.businessOverview,
           dna.brandAesthetic,
           ...(dna.uniqueSellingPoints || []),
           ...(dna.visualStyleKeywords || []),
         ].filter(Boolean),
         contentDNA: JSON.stringify({
           brandValues: dna.brandValues,
           brandAesthetic: dna.brandAesthetic,
           toneOfVoice: dna.toneOfVoice,
           uniqueSellingPoints: dna.uniqueSellingPoints,
           colors: dna.colors,
           fonts: dna.fonts,
           visualStyleKeywords: dna.visualStyleKeywords,
           tagline: dna.tagline,
           businessOverview: dna.businessOverview,
         }),
       };
       const res = await api.post('/api/brand-profiles', payload);
       const newProfile = res.data;
       setBrandProfiles(prev => [...prev, newProfile]);
       setDnaResult(null);
       setDnaUrl('');
       setDnaCreateMode(null);
       setShowCreatePanel(false);
       setRecentlyCreatedBrandId(newProfile.id);
       setShowGenerateWeekModal(true);
     } catch (err: any) {
       setDnaError('Failed to save brand profile: ' + (err?.response?.data?.error || err.message));
     } finally {
       setSavingBrand(false);
     }
   }

   // Reset create panel when closing
   useEffect(() => {
     if (!showCreatePanel) {
       setDnaCreateMode(null);
       setDnaResult(null);
       setDnaError('');
       setDnaUrl('');
     }
   }, [showCreatePanel]);

   useEffect(() => {
     fetchData();
     fetchUserProfile();
   }, []);

  async function fetchData() {
    try {
      const [settingsRes, profilesRes, connectorsRes] = await Promise.all([
        api.get('/api/settings'),
        api.get('/api/brand-profiles'),
        api.get('/api/connectors'),
      ]);
      setSettings(settingsRes.data);
      setBrandProfiles(profilesRes.data);
      const llmDetailsRes = await api.get('/api/connectors/llm-details');
      const modelDetails: Record<string, string> = {};
      for (const d of llmDetailsRes.data) {
        modelDetails[d.id] = d.modelName;
      }
      setLlmModelDetails(modelDetails);
      setLlmConnectors(connectorsRes.data.filter((c: Connector) => c.type === 'llm'));
      setMediaConnectors(connectorsRes.data.filter((c: Connector) => c.type === 'media_generation'));

      // Initialize form
      setAppName(settingsRes.data.appName || 'VIMO');
      setDefaultBrandId(settingsRes.data.defaultBrandId || '');
      setTimezone(settingsRes.data.timezone || 'UTC');
      setLanguage(settingsRes.data.language || 'en');
      setStreamingEnabled(settingsRes.data.streamingEnabled === 'true');
    } catch (err) {
      console.error('Failed to fetch settings data', err);
    }
  }

   async function fetchAuditLogs() {
     try {
       const res = await api.get('/api/settings/audit-logs');
       setAuditLogs(res.data);
     } catch (err) {
       console.error(err);
     }
   }

   async function fetchUserProfile() {
     try {
       const res = await api.get('/api/user-profile');
       setUserName(res.data.name || '');
       setUserEmail(res.data.email || '');
     } catch (err) {
       console.error('Failed to fetch user profile', err);
     }
   }

   async function handleSaveUserProfile(key: string, value: string) {
     try {
       await api.post('/api/user-profile', { [key]: value });
     } catch (err) {
       console.error(`Failed to save user profile ${key}`, err);
     }
   }

  useEffect(() => {
    if (activeTab === 'privacy') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  async function handleSaveSetting(key: string, value: string) {
    try {
      await api.post('/api/settings', { key, value });
      setSettings((prev) => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error(`Failed to save ${key}`, err);
    }
  }

  async function handleUpdatePin() {
    if (newPin !== confirmPin) {
      alert('New PINs do not match');
      return;
    }
    // In a real app, we'd have a specific endpoint for this
    try {
      await api.post('/api/auth/update-pin', { currentPin, newPin });
      alert('PIN updated successfully');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      alert('Failed to update PIN');
    }
  }

  async function handleResetData() {
    if (resetConfirm !== 'RESET') return;
    try {
      await api.post('/api/settings/reset', { confirm: 'RESET' });
      window.location.href = '/setup';
    } catch (err) {
      alert('Reset failed');
    }
  }

  async function handleExport() {
    try {
      const res = await api.get('/api/settings/export');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `vimo-export-${format(new Date(), 'yyyy-MM-dd')}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (err) {
      alert('Export failed');
    }
  }

  async function handleClearAnalytics() {
    if (!confirm('Are you sure you want to clear analytics data older than 30 days?')) return;
    try {
      await api.post('/api/settings/clear-analytics');
      alert('Analytics cleared');
      fetchAuditLogs();
    } catch (err) {
      alert('Failed to clear analytics');
    }
  }

  // AI provider management
  function getProviderPresets() {
    if (aiType === 'image') {
      return [
        { id: 'pollinations', name: 'Built-in Free (Pollinations)', placeholder: 'No key required', helpUrl: '' },
        { id: 'openai', name: 'OpenAI (DALL-E 3)', placeholder: 'sk-...', helpUrl: 'https://platform.openai.com/api-keys' },
        { id: 'stability', name: 'Stability AI', placeholder: 'Your API key', helpUrl: 'https://platform.stability.ai/account/keys' },
        { id: 'cloudflare', name: 'Cloudflare Workers AI', placeholder: 'Your API token', helpUrl: 'https://dash.cloudflare.com/profile/api-tokens' },
        { id: 'replicate', name: 'Replicate', placeholder: 'r8_...', helpUrl: 'https://replicate.com/account/api-tokens' },
        { id: 'custom', name: 'Custom OpenAI-Compatible', placeholder: 'Your API key', helpUrl: '' },
      ];
    }
    if (aiType === 'video') {
      return [
        { id: 'pollinations', name: 'Built-in Free (Pollinations)', placeholder: 'No key required', helpUrl: '' },
        { id: 'runway', name: 'Runway ML', placeholder: 'Your API key', helpUrl: 'https://runwayml.com/' },
        { id: 'pika', name: 'Pika Labs', placeholder: 'Your API key', helpUrl: 'https://pika.art/' },
        { id: 'huggingface', name: 'Hugging Face', placeholder: 'hf_...', helpUrl: 'https://huggingface.co/settings/tokens' },
        { id: 'custom', name: 'Custom Provider', placeholder: 'Your API key', helpUrl: '' },
      ];
    }
    return [
      { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', helpUrl: 'https://platform.openai.com/api-keys' },
      { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...', helpUrl: 'https://console.anthropic.com/' },
      { id: 'google', name: 'Google Gemini', placeholder: 'AIza...', helpUrl: 'https://aistudio.google.com/app/apikey' },
      { id: 'groq', name: 'Groq', placeholder: 'gsk_...', helpUrl: 'https://console.groq.com/keys' },
      { id: 'openrouter', name: 'OpenRouter', placeholder: 'Your API key', helpUrl: 'https://openrouter.ai/keys' },
      { id: 'mistral', name: 'Mistral', placeholder: 'Your API key', helpUrl: 'https://console.mistral.ai/' },
      { id: 'pollinations', name: 'Built-in Free (Pollinations.ai)', placeholder: 'No key required', helpUrl: '' },
      { id: 'custom', name: 'Custom OpenAI-Compatible', placeholder: 'Your API key', helpUrl: '' },
    ];
  }

  const AI_TYPE_OPTIONS = [
    { id: 'text', name: 'Text Generation', desc: 'Content writing, analytics, chatbot responses' },
    { id: 'image', name: 'Image Generation', desc: 'Post visuals, thumbnails, marketing images' },
    { id: 'video', name: 'Video Generation', desc: 'Short video clips, animations' },
  ];

  // Providers that expose a selectable list of model ids in the add/edit dialog.
  // (Custom providers enter a model name as free text; Pollinations uses a fixed model.)
  const MODEL_LIST_PROVIDERS = new Set(['openai', 'anthropic', 'google', 'mistral', 'groq', 'openrouter']);
  // Providers whose model list requires an API key to fetch dynamically.
  const KEYED_MODEL_PROVIDERS = new Set(['groq', 'openrouter']);

  useEffect(() => {
    if (!showAddAIProvider) return;
    if (!MODEL_LIST_PROVIDERS.has(aiProviderPreset)) return;
    if (KEYED_MODEL_PROVIDERS.has(aiProviderPreset) && (!aiProviderKey || aiProviderKey.length < 8)) return;

    let cancelled = false;
    async function loadModels() {
      try {
        setProviderModelsLoading(true);
        setProviderModelOptions([]);

        const res = await api.get('/api/connectors/llm-models', {
          params: { provider: aiProviderPreset, apiKey: aiProviderKey },
        });

        const models: string[] = res.data?.models || [];
        if (cancelled) return;

        setProviderModelOptions(models);
        // Keep an already-selected model (e.g. when editing) if it's still valid,
        // otherwise default to the first available model.
        setProviderSelectedModel((prev) => (models.includes(prev) ? prev : (models[0] || '')));
      } catch (err) {
        if (cancelled) return;
      } finally {
        if (!cancelled) setProviderModelsLoading(false);
      }
    }

    loadModels();
    return () => {
      cancelled = true;
    };
  }, [showAddAIProvider, aiProviderPreset, aiProviderKey]);

  async function handleAddAIProvider() {
    const presets = getProviderPresets();
    const preset = presets.find((p) => p.id === aiProviderPreset);
    if (!preset) return;

    // For providers with a selectable model list, a model must be chosen
    if (MODEL_LIST_PROVIDERS.has(aiProviderPreset) && !providerSelectedModel.trim()) {
      setAiProviderError('Please select a model for this provider.');
      return;
    }

    // For custom provider, validate extra fields
    if (aiProviderPreset === 'custom') {
      if (!aiCustomProviderName.trim() || !aiCustomBaseUrl.trim() || !aiCustomModelName.trim()) {
        setAiProviderError('Provider Name, Base URL, and Model Name are required for custom providers.');
        return;
      }
    } else if (aiProviderPreset !== 'pollinations') {
      if (!aiProviderKey.trim()) return;
    }

    setSavingAIProvider(true);
    setAiProviderError('');
    try {
      const config: Record<string, any> = { aiType };
      const credentials: Record<string, string> = {};

      if (aiProviderPreset === 'custom') {
        config.providerName = aiCustomProviderName.trim();
        config.baseUrl = aiCustomBaseUrl.trim();
        config.modelName = aiCustomModelName.trim();
        if (aiProviderKey.trim()) {
          credentials.apiKey = aiProviderKey.trim();
        }
      } else {
        // Any provider that exposes a model list stores the chosen model name
        if (MODEL_LIST_PROVIDERS.has(aiProviderPreset) && providerSelectedModel.trim()) {
          config.modelName = providerSelectedModel.trim();
        }
        if (aiProviderKey.trim()) {
          credentials.apiKey = aiProviderKey.trim();
        }
      }

      const name = (aiProviderPreset === 'custom' ? aiCustomProviderName.trim() : preset.name) || editingAIProvider?.name || preset.name;
      const connectorType = aiType === 'text' ? 'llm' : 'media_generation';

      if (editingAIProvider) {
        await api.put(`/api/connectors/${editingAIProvider.id}`, {
          name,
          config: { ...editingAIProvider.config, ...config },
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        });
      } else {
        await api.post('/api/connectors', {
          name,
          type: connectorType,
          provider: aiProviderPreset,
          status: 'active',
          config,
          credentials,
        });
      }

      setShowAddAIProvider(false);
      setEditingAIProvider(null);
      setAiProviderKey('');
      setAiCustomProviderName('');
      setAiCustomBaseUrl('');
      setAiCustomModelName('');

      const res = await api.get('/api/connectors');
      setLlmConnectors(res.data.filter((c: Connector) => c.type === 'llm'));

      const llmDetailsRes2 = await api.get('/api/connectors/llm-details');
      const modelDetails2: Record<string, string> = {};
      for (const d of llmDetailsRes2.data) {
        modelDetails2[d.id] = d.modelName;
      }
      setLlmModelDetails(modelDetails2);
    } catch (err: any) {
      setAiProviderError(err?.response?.data?.error || 'Failed to add AI provider. Check your API key.');
    } finally {
      setSavingAIProvider(false);
    }
  }

  async function handleRemoveAIProvider(connector: Connector) {
    if (!window.confirm(`Remove "${connector.name}" AI provider? This will delete its API key from VIMO.`)) return;
    try {
      await api.delete(`/api/connectors/${connector.id}`);
      setLlmConnectors((prev) => prev.filter((c) => c.id !== connector.id));
      const newDetails = { ...llmModelDetails };
      delete newDetails[connector.id];
      setLlmModelDetails(newDetails);
    } catch (err) {
      console.error('Failed to remove AI provider', err);
      alert('Failed to remove AI provider.');
    }
  }

  function handleEditAIProvider(connector: Connector) {
    setEditingAIProvider(connector);
    setAiProviderPreset(connector.provider);
    setAiProviderKey('');
    setAiProviderError('');
    setAiCustomProviderName(connector.config?.providerName || '');
    setAiCustomBaseUrl(connector.config?.baseUrl || '');
    setAiCustomModelName(connector.config?.modelName || '');
    // Pre-select the saved model so the picker reflects the current choice
    setProviderModelOptions([]);
    setProviderSelectedModel((connector.config?.modelName as string) || '');
    setShowAddAIProvider(true);
  }

  // Brand profile CRUD
  function openEditBrandModal(profile: BrandProfile) {
    setEditingBrand(profile);
    setBrandFormName(profile.name);
    setBrandFormIndustry(profile.industry);
    setBrandFormAudience(profile.audience);
    setBrandFormWebsite(profile.website || '');
    setBrandFormTones(profile.toneKeywords || []);
    setBrandFormExamples(profile.examplePosts?.length ? profile.examplePosts : ['']);
    setShowBrandModal(true);
  }

  function closeBrandModal() {
    setShowBrandModal(false);
    setEditingBrand(null);
  }

  function toggleBrandTone(tone: string) {
    if (brandFormTones.includes(tone)) {
      setBrandFormTones((prev) => prev.filter((t) => t !== tone));
    } else if (brandFormTones.length < 4) {
      setBrandFormTones((prev) => [...prev, tone]);
    }
  }

  function addBrandExample() {
    if (brandFormExamples.length < 5) {
      setBrandFormExamples((prev) => [...prev, '']);
    }
  }

  function updateBrandExample(idx: number, value: string) {
    setBrandFormExamples((prev) => {
      const updated = [...prev];
      updated[idx] = value;
      return updated;
    });
  }

  async function handleSaveBrand() {
    if (!brandFormName || !brandFormIndustry || !brandFormAudience) return;
    setSavingBrand(true);
    try {
      const payload: Record<string, any> = {
        name: brandFormName,
        industry: brandFormIndustry,
        audience: brandFormAudience,
        toneKeywords: brandFormTones,
        examplePosts: brandFormExamples.filter(Boolean),
      };
      if (brandFormWebsite) payload.website = brandFormWebsite;

      let createdId: string | null = null;
      if (editingBrand) {
        await api.put(`/api/brand-profiles/${editingBrand.id}`, payload);
      } else {
        const res = await api.post('/api/brand-profiles', payload);
        createdId = res.data.id;
      }

      setShowCreatePanel(false);
      closeBrandModal();
      // Refresh brand profiles
      const res = await api.get('/api/brand-profiles');
      setBrandProfiles(res.data);
      // Also update the global brand store so Header picks it up
      useBrandStore.getState().fetchProfiles(true);

      // After creating a new brand, offer to generate a week of content
      if (createdId) {
        setRecentlyCreatedBrandId(createdId);
        setShowGenerateWeekModal(true);
      }
    } catch (err) {
      console.error('Failed to save brand profile', err);
      alert('Failed to save brand profile');
    } finally {
      setSavingBrand(false);
    }
  }

  async function handleGenerateWeek() {
    if (!recentlyCreatedBrandId) return;
    setGeneratingWeek(true);
    setGeneratedWeekResult(null);
    try {
      const res = await api.post(`/api/brand-profiles/${recentlyCreatedBrandId}/generate-week`, {}, { timeout: 180000 });
      setGeneratedWeekResult(res.data);
    } catch (err) {
      console.error('Failed to generate week of content', err);
      alert('Failed to generate content. Check your AI model configuration.');
    } finally {
      setGeneratingWeek(false);
    }
  }

  async function handleDeleteBrand(profile: BrandProfile) {
    if (!window.confirm(`Are you sure you want to delete "${profile.name}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/api/brand-profiles/${profile.id}`);
      // Refresh brand profiles
      const res = await api.get('/api/brand-profiles');
      setBrandProfiles(res.data);
    } catch (err) {
      console.error('Failed to delete brand profile', err);
      alert('Failed to delete brand profile');
    }
  }

  const tabs = [
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'user', label: 'User', icon: User },
    { id: 'dna', label: 'DNA', icon: Dna },
    { id: 'ai', label: 'AI Models', icon: Bot },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Data & Privacy', icon: Database },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-4 sm:px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Configure your VIMO instance</p>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Sidebar Nav */}
        <aside className="w-full lg:w-64 border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50 overflow-x-auto">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 lg:p-8 dark:bg-slate-900">
          <div className="max-w-3xl space-y-10">
            {activeTab === 'general' && (
              <section className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">App Settings</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">App Name</label>
                      <input
                        type="text"
                        value={appName}
                        onChange={(e) => {
                          setAppName(e.target.value);
                          handleSaveSetting('appName', e.target.value);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Default Brand Profile</label>
                      <select
                        value={defaultBrandId}
                        onChange={(e) => {
                          setDefaultBrandId(e.target.value);
                          handleSaveSetting('defaultBrandId', e.target.value);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">None</option>
                        {brandProfiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Timezone</label>
                      <select
                        value={timezone}
                        onChange={(e) => {
                          setTimezone(e.target.value);
                          handleSaveSetting('timezone', e.target.value);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">Eastern Time</option>
                        <option value="America/Los_Angeles">Pacific Time</option>
                        <option value="Europe/London">London</option>
                        <option value="Asia/Tokyo">Tokyo</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Language</label>
                      <select
                        value={language}
                        onChange={(e) => {
                          setLanguage(e.target.value);
                          handleSaveSetting('language', e.target.value);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="h-5 w-5 text-amber-500" />
                    Security
                  </h2>
                  <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-4">
                    <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Change PIN</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <input
                        type="password"
                        placeholder="Current PIN"
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <input
                        type="password"
                        placeholder="New PIN"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <input
                        type="password"
                        placeholder="Confirm New PIN"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <button
                      onClick={handleUpdatePin}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                      Update PIN
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Danger Zone
                  </h2>
                  <div className="mt-4 p-4 rounded-xl border border-red-100 dark:border-red-900/20 bg-red-50 dark:bg-red-900/10">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      Resetting VIMO will permanently delete all brand profiles, campaigns, posts, and connectors. This action cannot be undone.
                    </p>
                    {!showResetDialog ? (
                      <button
                        onClick={() => setShowResetDialog(true)}
                        className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Reset all data
                      </button>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs font-bold text-red-600 uppercase">Type "RESET" to confirm</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={resetConfirm}
                            onChange={(e) => setResetConfirm(e.target.value)}
                            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none dark:border-red-800 dark:bg-slate-800 dark:text-white"
                            placeholder="RESET"
                          />
                          <button
                            onClick={handleResetData}
                            disabled={resetConfirm !== 'RESET'}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Reset VIMO
                          </button>
                          <button
                            onClick={() => setShowResetDialog(false)}
                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'ai' && (
              <section className="space-y-6">
                {/* AI Provider Management */}
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Bot className="h-5 w-5 text-teal-500" />
                    AI Providers
                  </h2>
                  <p className="text-sm text-slate-500">
                    Manage your AI provider connections. Add API keys for the LLM providers you want to use.
                    Your keys are stored encrypted and never shared.
                  </p>

                  {llmConnectors.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No AI providers connected yet. Add an API key below to get started.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {llmConnectors.map((conn) => (
                        <div
                          key={conn.id}
                          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                              {conn.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                                {conn.name}
                                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-mono">
                                  {llmModelDetails[conn.id] || '...'}
                                </span>
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  conn.status === 'active'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                  {conn.status}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {conn.provider}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 ml-2">
                            <button
                              onClick={() => handleEditAIProvider(conn)}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-2.5 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleRemoveAIProvider(conn)}
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 px-2.5 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add AI Provider Button */}                    <button
                    onClick={() => {
                      setShowAddAIProvider(true);
                      setEditingAIProvider(null);
                      setAiProviderKey('');
                      setAiProviderError('');
                      setAiCustomProviderName('');
                      setAiCustomBaseUrl('');
                      setAiCustomModelName('');
                      setProviderModelOptions([]);
                      setProviderSelectedModel('');
                    }}
                    className="w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 dark:text-slate-400 dark:hover:border-teal-500 dark:hover:text-teal-400 dark:hover:bg-teal-900/20 transition-all inline-flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add AI Provider
                  </button>
                </div>

                {/* Model Assignments */}
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI Model Assignments</h2>
                  <p className="text-sm text-slate-500">Choose which connected LLM to use for each agent task. When a task is set to Default, VIMO uses the first active provider.</p>
                  
                  <div className="mt-4 space-y-2">
                    {[
                      { id: 'content_generation', label: 'Content Generation', desc: 'Post writing, Reel scripts, hashtags' },
                      { id: 'analytics_insights', label: 'Analytics Insights', desc: 'Performance summaries, weekly reports' },
                      { id: 'assistant_classification', label: 'VIMO Assistant (Classification)', desc: 'Understanding what you want to do' },
                      { id: 'assistant_answer', label: 'VIMO Assistant (Answers)', desc: 'Answering your marketing questions' },
                      { id: 'campaign_analysis', label: 'Campaign Analysis', desc: 'Campaign performance review, brand memory' },
                      { id: 'content_dna_analysis', label: 'Content DNA Analysis', desc: 'Learning from every post you publish' },
                      { id: 'campaign_strategy', label: 'Campaign Strategy', desc: 'Campaign goal translation and funnel planning' },
                      { id: 'campaign_calendar', label: 'Campaign Calendar', desc: 'Content calendar generation for campaigns' },
                      { id: 'engagement_intent_detection', label: 'Engagement Intent Detection', desc: 'Classifying comment intents (purchase, spam, question)' },
                      { id: 'engagement_sentiment', label: 'Engagement Sentiment', desc: 'Sentiment analysis of incoming comments' },
                      { id: 'engagement_reply_generation', label: 'Engagement Reply Generation', desc: 'AI-generated replies to comments' },
                      { id: 'trend_analysis', label: 'Trend Analysis', desc: 'Trend discovery and relevance scoring' },
                      { id: 'brand_voice_analysis', label: 'Brand Voice Analysis', desc: 'Brand voice fingerprint and content DNA' },
                      { id: 'brand_roast', label: 'Brand Roast', desc: 'Brutal honest brand marketing analysis' },
                      { id: 'connector_health', label: 'Connector Health', desc: 'Periodic connector connectivity checks' },
                      { id: 'hashtag_generation', label: 'Hashtag Generation', desc: 'Three-tier hashtag strategy for posts' },
                      { id: 'marketing_time_machine', label: 'Marketing Time Machine', desc: 'Historical performance analysis and timeline' },
                      { id: 'competitor_analysis', label: 'Competitor Analysis', desc: 'Competitor profile and strategy analysis' },
                      { id: 'growth_analysis', label: 'Growth Analysis', desc: 'High-performer detection and growth opportunities' },
                      { id: 'opportunity_analysis', label: 'Opportunity Analysis', desc: 'Content and news-jacking opportunity scanning' },
                      { id: 'weekly_content_generation', label: 'Weekly Content Generation', desc: 'Weekly content packages from MCP sources' },
                    ].map((task) => {
                      const assignedConnectorId = settings[`model_${task.id}`] || '';
                      const assignedConnector = llmConnectors.find(c => c.id === assignedConnectorId);
                      const resolvedModel = assignedConnector
                        ? llmModelDetails[assignedConnector.id]
                        : (llmConnectors.find(c => c.status === 'active')
                          ? llmModelDetails[llmConnectors.find(c => c.status === 'active')!.id]
                          : null);
                      return (
                      <div key={task.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-800 transition-colors">
                        <div className="flex-1 min-w-0 mr-4">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{task.label}</span>
                          <p className="text-xs text-slate-400 mt-0.5">{task.desc}</p>
                          {resolvedModel && (
                            <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1 font-mono">
                              Resolves to: {resolvedModel}
                            </p>
                          )}
                        </div>
                        <select
                          value={assignedConnectorId}
                          onChange={(e) => handleSaveSetting(`model_${task.id}`, e.target.value)}
                          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white w-48"
                        >
                          <option value="">Default (auto)</option>
                          {llmConnectors.filter(c => c.status === 'active').map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} {llmModelDetails[c.id] ? `(${llmModelDetails[c.id]})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    );})}
                  </div>
                </div>

                {/* Image & Video Model Assignments */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Image & Video Model Assignments</h2>
                  <p className="text-sm text-slate-500 mb-4">Choose which connected media provider to use for image and video generation.</p>

                  <div className="space-y-2">
                    {[
                      { id: 'image_generation', label: 'Image Generation', desc: 'Post visuals, thumbnails, marketing images', icon: '🖼️' },
                      { id: 'video_generation', label: 'Video Generation', desc: 'Short video clips, animations, reels', icon: '🎬' },
                    ].map((task) => {
                      const assignedConnectorId = settings[`model_${task.id}`] || '';
                      const assignedConnector = mediaConnectors.find(c => c.id === assignedConnectorId);
                      return (
                        <div key={task.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-800 transition-colors">
                          <div className="flex-1 min-w-0 mr-4">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {task.icon} {task.label}
                            </span>
                            <p className="text-xs text-slate-400 mt-0.5">{task.desc}</p>
                            {assignedConnector && (
                              <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1 font-mono">
                                {assignedConnector.provider} {assignedConnector.config?.modelName ? `(${assignedConnector.config.modelName})` : ''}
                              </p>
                            )}
                          </div>
                          <select
                            value={assignedConnectorId}
                            onChange={(e) => handleSaveSetting(`model_${task.id}`, e.target.value)}
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white w-48"
                          >
                            <option value="">Default (auto / built-in free)</option>
                            {mediaConnectors.filter(c => c.status === 'active').map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.provider})
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Streaming Output</h2>
                      <p className="text-sm text-slate-500">Display AI generated text word-by-word in real-time.</p>
                    </div>
                    <button
                      onClick={() => {
                        const val = !streamingEnabled;
                        setStreamingEnabled(val);
                        handleSaveSetting('streamingEnabled', val.toString());
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        streamingEnabled ? 'bg-teal-600' : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          streamingEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'notifications' && (
              <section className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Bell className="h-5 w-5 text-indigo-500" />
                    Email Notifications
                  </h2>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Notification Email</label>
                      <input
                        type="email"
                        placeholder="your@email.com"
                        value={settings.notificationEmail || ''}
                        onChange={(e) => handleSaveSetting('notificationEmail', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-3">
                      {[
                        { key: 'notify_campaign', label: 'Campaign completed' },
                        { key: 'notify_post_failed', label: 'Post failed' },
                        { key: 'notify_weekly_report', label: 'Weekly report' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between">
                          <span className="text-sm text-slate-700 dark:text-slate-300">{item.label}</span>
                          <button
                            onClick={() => handleSaveSetting(item.key, (settings[item.key] !== 'true').toString())}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                              settings[item.key] === 'true' ? 'bg-teal-600' : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                          >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings[item.key] === 'true' ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 italic text-xs text-slate-400">
                      Note: Email notifications will be active in a future update.
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-blue-500" />
                    Desktop Notifications
                  </h2>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => Notification.requestPermission()}
                      className="flex items-center space-x-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Bell className="h-4 w-4" />
                      <span>Enable Browser Notifications</span>
                    </button>
                    <p className="mt-2 text-xs text-slate-500">Receive alerts for post failures and urgent engagement items directly on your desktop.</p>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'privacy' && (
              <section className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                    <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-medium">
                      <Download className="h-5 w-5 text-teal-500" />
                      <span>Data Export</span>
                    </div>
                    <p className="text-xs text-slate-500">Download a full JSON dump of your VIMO data (excludes encrypted credentials).</p>
                    <button
                      onClick={handleExport}
                      className="w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                    >
                      Export All Data
                    </button>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                    <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-medium">
                      <Trash2 className="h-5 w-5 text-red-500" />
                      <span>Maintenance</span>
                    </div>
                    <p className="text-xs text-slate-500">Clear old logs and temporary data to free up space and maintain performance.</p>
                    <button
                      onClick={handleClearAnalytics}
                      className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/10"
                    >
                      Clear Analytics Data ({'>'}30d)
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Audit Logs</h2>
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Agent</th>
                          <th className="px-4 py-3">Action</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="text-slate-600 dark:text-slate-400">
                            <td className="px-4 py-3 whitespace-nowrap">{format(new Date(log.createdAt), 'MMM d, HH:mm')}</td>
                            <td className="px-4 py-3">{log.agentName}</td>
                            <td className="px-4 py-3">{log.action}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                log.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'about' && (
               <section className="space-y-6">
                 <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                   <div className="h-20 w-20 rounded-3xl bg-teal-500 flex items-center justify-center text-white shadow-xl shadow-teal-500/20">
                     <Bot className="h-10 w-10" />
                   </div>
                   <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
                     Version 0.1.0
                   </div>
                 </div>
 
                 <div className="grid gap-4 sm:grid-cols-2">
                   {[
                     { label: 'GitHub Repository', url: 'https://github.com/yourusername/vimo' },
                     { label: 'Documentation', url: 'https://github.com/yourusername/vimo#readme' },
                     { label: 'Report a Bug', url: 'https://github.com/yourusername/vimo/issues' },
                     { label: 'Community Discord', url: 'https://github.com/yourusername/vimo/discussions' },
                   ].map((link) => (
                     <a
                       key={link.label}
                       href={link.url}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all"
                     >
                       <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{link.label}</span>
                       <ExternalLink className="h-4 w-4 text-slate-400" />
                     </a>
                   ))}
                 </div>
 
                 <div className="pt-6 flex justify-center">
                   <button
                     onClick={() => alert('You are on the latest version')}
                     className="flex items-center space-x-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
                   >
                     <RefreshCw className="h-4 w-4" />
                     <span>Check for updates</span>
                   </button>
                 </div>
               </section>
             )}
             {activeTab === 'user' && (
               <section className="space-y-6">
                 {/* User Profile Section */}
                 <div className="space-y-4">
                   <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                     <User className="h-5 w-5" />
                     User Profile
                   </h2>
                   <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-4">
                     <div className="space-y-2">
                       <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Name</label>
                       <input
                         type="text"
                         placeholder="Enter your name"
                         value={userName}
                         onChange={(e) => {
                           setUserName(e.target.value);
                           handleSaveUserProfile('name', e.target.value);
                         }}
                         className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email</label>
                       <input
                         type="email"
                         placeholder="Enter your email"
                         value={userEmail}
                         onChange={(e) => {
                           setUserEmail(e.target.value);
                           handleSaveUserProfile('email', e.target.value);
                         }}
                         className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                       />
                     </div>
                   </div>
                 </div>
 
                 </section>
               )}

              {activeTab === 'dna' && (
                <section className="space-y-6">
                  {/* Business DNA — Pomelli-style brand identity & profile management */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Dna className="h-5 w-5 text-purple-500" />
                          Business DNA
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          Your brand's genetic code. Manage profiles, analyze websites, or set up manually.
                        </p>
                      </div>
                    </div>

                    {/* ── Existing Brand Profiles ── */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          Brand Profiles
                        </h3>
                        <button
                          onClick={() => setShowCreatePanel(!showCreatePanel)}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {showCreatePanel ? 'Cancel' : 'Add Brand'}
                        </button>
                      </div>

                      {/* Default selector */}
                      {brandProfiles.length > 0 && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 shrink-0">Default:</label>
                          <select
                            value={defaultBrandId}
                            onChange={(e) => {
                              setDefaultBrandId(e.target.value);
                              handleSaveSetting('defaultBrandId', e.target.value);
                            }}
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            <option value="">None</option>
                            {brandProfiles.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Profile list */}
                      {brandProfiles.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">
                          No brand profiles yet. Click "Add Brand" to create one.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {brandProfiles.map((profile) => (
                            <div key={profile.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{profile.name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{profile.industry} · {profile.audience}</p>
                              </div>
                              <div className="flex gap-1.5 shrink-0 ml-2">
                                <button onClick={() => openEditBrandModal(profile)} className="rounded-md p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleDeleteBrand(profile)} className="rounded-md p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Create Panel (Pomelli-style) ── */}
                    {showCreatePanel && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
                        {/* Step 1: Mode Selector */}
                        {dnaCreateMode === null && (
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => setDnaCreateMode('url')}
                              className="p-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all text-left group"
                            >
                              <Globe className="h-6 w-6 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analyze Website</h3>
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                Enter your website URL and VIMO will automatically extract your brand's colors, fonts, tone, values, and more.
                              </p>
                            </button>
                            <button
                              onClick={() => setDnaCreateMode('manual')}
                              className="p-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-all text-left group"
                            >
                              <Pencil className="h-6 w-6 text-teal-500 mb-2 group-hover:scale-110 transition-transform" />
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Start from Scratch</h3>
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                No website? No problem. Enter your brand details manually.
                              </p>
                            </button>
                          </div>
                        )}

                        {/* ── Mode: URL Analysis ── */}
                        {dnaCreateMode === 'url' && (
                          <div className="space-y-4">
                            {/* URL input + analyze */}
                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Enter Website URL</h3>
                                <button onClick={() => { setDnaCreateMode(null); setDnaResult(null); setDnaError(''); }} className="text-xs text-slate-400 hover:text-slate-600 underline">
                                  Change mode
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                  <input
                                    type="url"
                                    value={dnaUrl}
                                    onChange={(e) => setDnaUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeDNA()}
                                    placeholder="https://example.com"
                                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                  />
                                </div>
                                <button
                                  onClick={handleAnalyzeDNA}
                                  disabled={dnaLoading || !dnaUrl}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                >
                                  {dnaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                  {dnaLoading ? 'Analyzing...' : 'Analyze'}
                                </button>
                              </div>

                              {dnaLoading && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Crawling website and extracting brand identity...</span>
                                  </div>
                                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                    <div className="h-full rounded-full bg-purple-500 animate-pulse" style={{ width: '60%' }} />
                                  </div>
                                </div>
                              )}

                              {dnaError && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  <span>{dnaError}</span>
                                </div>
                              )}
                            </div>

                            {/* DNA Results (editable before saving) */}
                            {dnaResult && !dnaLoading && (
                              <EditableDNAResults
                                dna={dnaResult.dna}
                                website={dnaResult.website}
                                onSave={handleSaveDNAAsBrand}
                                saving={savingBrand}
                              />
                            )}
                          </div>
                        )}

                        {/* ── Mode: Manual Entry ── */}
                        {dnaCreateMode === 'manual' && (
                          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Brand Details</h3>
                              <button onClick={() => setDnaCreateMode(null)} className="text-xs text-slate-400 hover:text-slate-600 underline">
                                Change mode
                              </button>
                            </div>

                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Brand Name *</label>
                                <input
                                  type="text"
                                  value={brandFormName}
                                  onChange={(e) => setBrandFormName(e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                  placeholder="Your brand name"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Industry *</label>
                                <select
                                  value={brandFormIndustry}
                                  onChange={(e) => setBrandFormIndustry(e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                >
                                  <option value="">Select industry</option>
                                  {['Technology', 'E-commerce', 'Health & Wellness', 'Food & Beverage', 'Finance', 'Education', 'Creative/Agency', 'Other'].map((i) => (
                                    <option key={i} value={i}>{i}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Target Audience *</label>
                                <input
                                  type="text"
                                  value={brandFormAudience}
                                  onChange={(e) => setBrandFormAudience(e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                  placeholder="e.g. Startup founders aged 25-40"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Website (optional)</label>
                                <input
                                  type="url"
                                  value={brandFormWebsite}
                                  onChange={(e) => setBrandFormWebsite(e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                  placeholder="https://example.com"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Tone (select up to 4)</label>
                                <div className="flex flex-wrap gap-1.5">
                                  {['Professional', 'Casual', 'Bold', 'Playful', 'Authoritative', 'Friendly', 'Inspirational', 'Humorous'].map((tone) => (
                                    <button
                                      key={tone}
                                      onClick={() => toggleBrandTone(tone)}
                                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                        brandFormTones.includes(tone)
                                          ? 'bg-teal-600 text-white'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                      }`}
                                    >
                                      {tone}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Example Posts</label>
                                <div className="space-y-1.5">
                                  {brandFormExamples.map((ex, i) => (
                                    <textarea
                                      key={i}
                                      rows={2}
                                      value={ex}
                                      onChange={(e) => updateBrandExample(i, e.target.value)}
                                      placeholder={`Example post ${i + 1}`}
                                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                    />
                                  ))}
                                  {brandFormExamples.length < 5 && (
                                    <button onClick={addBrandExample} className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400">
                                      + Add another example
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={handleSaveBrand}
                              disabled={!brandFormName || !brandFormIndustry || !brandFormAudience || savingBrand}
                              className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
                            >
                              {savingBrand ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                              ) : (
                                <><Check className="h-4 w-4" /> Save Brand Profile</>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
           </div>
         </main>
       </div>

      {/* Add / Edit AI Provider Modal */}
      {showAddAIProvider && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20 overflow-y-auto" onClick={() => { setShowAddAIProvider(false); setEditingAIProvider(null); }}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {editingAIProvider ? 'Edit AI Provider' : 'Add AI Provider'}
              </h2>
              <button onClick={() => { setShowAddAIProvider(false); setEditingAIProvider(null); }} className="text-slate-400 hover:text-slate-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* AI Type Selector */}
              {!editingAIProvider && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">AI Type *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {AI_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setAiType(opt.id);
                          const newPresets = getProviderPresets();
                          if (newPresets.length > 0) {
                            setAiProviderPreset(newPresets[0].id);
                          }
                        }}
                        className={`rounded-lg border p-2.5 text-center transition ${
                          aiType === opt.id
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-400'
                            : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div className={`text-xs font-medium ${
                          aiType === opt.id ? 'text-teal-700 dark:text-teal-300' : 'text-slate-700 dark:text-slate-300'
                        }`}>{opt.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Provider</label>
                    <select
                      value={aiProviderPreset}
                      disabled={!!editingAIProvider}
                      onChange={(e) => {
                        setAiProviderPreset(e.target.value);
                        setAiProviderError('');
                        setProviderSelectedModel('');
                        setProviderModelOptions([]);
                        if (e.target.value !== 'custom') {
                          setAiCustomProviderName('');
                          setAiCustomBaseUrl('');
                          setAiCustomModelName('');
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    >
                      {getProviderPresets().map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

              {/* Provider Model Picker for any provider with a selectable model list */}
              {MODEL_LIST_PROVIDERS.has(aiProviderPreset) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Model *
                  </label>
                  <select
                    value={providerSelectedModel}
                    onChange={(e) => {
                      setProviderSelectedModel(e.target.value);
                      setAiProviderError('');
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    disabled={providerModelsLoading || providerModelOptions.length === 0}
                  >
                    {providerModelsLoading && <option value="">Loading models...</option>}
                    {!providerModelsLoading && providerModelOptions.length === 0 && <option value="">No models available</option>}
                    {!providerModelsLoading && providerModelOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Choose the exact model to use for this provider.
                  </p>
                </div>
              )}

              {/* Custom Provider extra fields */}
              {aiProviderPreset === 'custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Provider Name *
                    </label>
                    <input
                      type="text"
                      value={aiCustomProviderName}
                      onChange={(e) => {
                        setAiCustomProviderName(e.target.value);
                        setAiProviderError('');
                      }}
                      placeholder="e.g. My Custom LLM"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Base API URL *
                    </label>
                    <input
                      type="url"
                      value={aiCustomBaseUrl}
                      onChange={(e) => {
                        setAiCustomBaseUrl(e.target.value);
                        setAiProviderError('');
                      }}
                      placeholder="https://api.myprovider.com/v1"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                    <p className="text-xs text-slate-400 mt-1">Must be an OpenAI-compatible API endpoint.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Model Name *
                    </label>
                    <input
                      type="text"
                      value={aiCustomModelName}
                      onChange={(e) => {
                        setAiCustomModelName(e.target.value);
                        setAiProviderError('');
                      }}
                      placeholder="e.g. gpt-4o, my-model-name"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                  </div>
                </>
              )}

              {aiProviderPreset === 'pollinations' ? (
                <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 dark:bg-teal-900/20 dark:border-teal-800">
                  <p className="text-sm font-medium text-teal-700 dark:text-teal-300">No API key needed</p>
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                    Pollinations.ai is a free, open-source AI that works out of the box. No configuration required.
                    {aiType === 'image' && ' Images are generated via pollinations.ai free image API.'}
                    {aiType === 'video' && ' Video generation uses pollinations.ai (beta).'}
                  </p>
                </div>
              ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  API Key{aiProviderPreset !== 'custom' && aiProviderPreset !== 'pollinations' && (
                    <a
                      href={getProviderPresets().find(p => p.id === aiProviderPreset)?.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-xs text-teal-600 hover:text-teal-500"
                    >
                      (Get your key)
                    </a>
                  )}
                </label>
                <input
                  type="password"
                  value={aiProviderKey}
                  onChange={(e) => {
                    setAiProviderKey(e.target.value);
                    setAiProviderError('');
                  }}
                  placeholder={getProviderPresets().find(p => p.id === aiProviderPreset)?.placeholder || 'Your API key'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddAIProvider()}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Your API key is stored encrypted on your machine. VIMO never shares your key.
                </p>
              </div>
              )}

              {aiProviderError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg dark:bg-red-900/20 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {aiProviderError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowAddAIProvider(false); setEditingAIProvider(null); }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAIProvider}
                  disabled={(!editingAIProvider && !aiProviderKey.trim() && aiProviderPreset !== 'pollinations') || savingAIProvider}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {savingAIProvider ? (
                    <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {editingAIProvider ? 'Updating...' : 'Connecting...'}</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4" /> {editingAIProvider ? 'Save Changes' : 'Connect'}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Week of Content Modal */}
      {showGenerateWeekModal && recentlyCreatedBrandId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 sm:pt-20 overflow-y-auto" onClick={() => { if (!generatingWeek) { setShowGenerateWeekModal(false); } }}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Generate Content Week</h2>
              <button onClick={() => { if (!generatingWeek) setShowGenerateWeekModal(false); }} className="text-slate-400 hover:text-slate-500 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!generatingWeek && !generatedWeekResult && (
              <div className="space-y-4">
                <div className="rounded-lg bg-teal-50 p-4 text-sm text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                  <p className="font-medium">Brand profile created successfully!</p>
                  <p className="mt-1">Would you like VIMO to auto-generate 7 days of content for your new brand?</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowGenerateWeekModal(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleGenerateWeek}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 inline-flex items-center gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate Week of Content
                  </button>
                </div>
              </div>
            )}

            {generatingWeek && (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <span className="h-8 w-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Generating 7 days of content...</p>
                <p className="text-xs text-slate-400">VIMO is creating unique posts for each day of the week</p>
              </div>
            )}

            {generatedWeekResult && !generatingWeek && (
              <div className="space-y-4">
                <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
                  <p className="font-medium"><CheckCircle2 className="inline h-4 w-4 mr-1" />Content week generated!</p>
                  <p className="mt-1">{generatedWeekResult.posts?.length || 0} posts created from {generatedWeekResult.weekStart} to {generatedWeekResult.weekEnd}.</p>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {generatedWeekResult.posts?.map((post: any) => (
                    <div key={post.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium capitalize bg-slate-100 px-2 py-0.5 rounded dark:bg-slate-700">{post.platform}</span>
                        <span className="text-xs text-slate-400">{new Date(post.scheduledAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 dark:text-slate-400">{post.content}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowGenerateWeekModal(false);
                      setGeneratedWeekResult(null);
                      setRecentlyCreatedBrandId(null);
                    }}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Brand Profile Modal */}
      {showBrandModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 sm:pt-20 overflow-y-auto" onClick={closeBrandModal}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {editingBrand ? 'Edit Brand Profile' : 'Add Brand Profile'}
              </h2>
              <button onClick={closeBrandModal} className="text-slate-400 hover:text-slate-500 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Name *</label>
                <input
                  type="text"
                  value={brandFormName}
                  onChange={(e) => setBrandFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="Enter brand name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Industry *</label>
                <select
                  value={brandFormIndustry}
                  onChange={(e) => setBrandFormIndustry(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                >
                  <option value="">Select an industry</option>
                  {['Technology', 'E-commerce', 'Health & Wellness', 'Food & Beverage', 'Finance', 'Education', 'Creative/Agency', 'Other'].map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Target Audience *</label>
                <input
                  type="text"
                  value={brandFormAudience}
                  onChange={(e) => setBrandFormAudience(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="e.g. Startup founders aged 25-40"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Website URL</label>
                <input
                  type="url"
                  value={brandFormWebsite}
                  onChange={(e) => setBrandFormWebsite(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="https://example.com"
                />
                <p className="mt-1 text-xs text-slate-400">VIMO will crawl your entire website for deep brand understanding</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tone (select up to 4)</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {['Professional', 'Casual', 'Bold', 'Playful', 'Authoritative', 'Friendly', 'Inspirational', 'Humorous'].map((tone) => (
                    <button
                      key={tone}
                      onClick={() => toggleBrandTone(tone)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        brandFormTones.includes(tone)
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Example Posts</label>
                <div className="mt-1 space-y-2">
                  {brandFormExamples.map((ex, i) => (
                    <textarea
                      key={i}
                      rows={2}
                      value={ex}
                      onChange={(e) => updateBrandExample(i, e.target.value)}
                      placeholder={`Example post ${i + 1}`}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                  ))}
                  {brandFormExamples.length < 5 && (
                    <button
                      onClick={addBrandExample}
                      className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
                    >
                      + Add another example
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-700 pt-4">
              <button
                onClick={closeBrandModal}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBrand}
                disabled={!brandFormName || !brandFormIndustry || !brandFormAudience || savingBrand}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {savingBrand ? (
                  <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> {editingBrand ? 'Update' : 'Create'} Brand</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
