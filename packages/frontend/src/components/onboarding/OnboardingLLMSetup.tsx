import { useState, useEffect } from 'react';
import axios from 'axios';
import { Check, ExternalLink, HelpCircle, Sparkles, ChevronDown, Search, RefreshCw } from 'lucide-react';
import HowToGetKeyModal from './HowToGetKeyModal';

interface Preset {
  id: string;
  name: string;
  type: string;
  provider: string;
  description: string;
  authType: string;
  requiredCredentials: { key: string; label: string; placeholder: string; isSecret: boolean; helpUrl?: string }[];
}

interface Props {
  onComplete: () => void;
}

export default function OnboardingLLMSetup({ onComplete }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [helpModalProvider, setHelpModalProvider] = useState<{ id: string; name: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => {
    axios
      .get('/api/connectors/presets')
      .then((res) => setPresets(res.data.filter((p: Preset) => p.type === 'llm')))
      .catch(() => setPresets([]));
  }, []);

  const selected = presets.find((p) => p.id === selectedId);
  const provider = selected?.id?.replace('preset-', '');
  const isDynamicProvider = provider === 'groq' || provider === 'openrouter';

  useEffect(() => {
    if (!isDynamicProvider || !credentials.apiKey || credentials.apiKey.length < 5) return;
    if (!showForm) return;
    let cancelled = false;
    async function loadModels() {
      try {
        setModelsLoading(true);
        const res = await axios.get('/api/connectors/llm-models', {
          params: { provider, apiKey: credentials.apiKey },
        });
        if (cancelled) return;
        const list: string[] = res.data?.models || [];
        setModels(list);
        if (list.length > 0 && !selectedModel) setSelectedModel(list[0]);
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }
    loadModels();
    return () => { cancelled = true; };
  }, [isDynamicProvider, credentials.apiKey, showForm, provider]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setShowForm(true);
    setCredentials({});
    setTestResult(null);
    setModels([]);
    setSelectedModel('');
    setModelSearch('');
  }

  async function handleTestSave() {
    if (!selected) return;
    setTesting(true);
    setTestResult(null);
    try {
      const config: Record<string, string> = {};
      if (isDynamicProvider && selectedModel) {
        config.modelName = selectedModel;
      }
      const createRes = await axios.post('/api/connectors', {
        name: selected.name,
        type: 'llm',
        provider: selected.id.replace('preset-', ''),
        status: 'active',
        config,
        credentials,
      });
      const testRes = await axios.post(`/api/connectors/${createRes.data.id}/test`);
      if (testRes.data.success) {
        setTestResult('success');
        setTimeout(() => onComplete(), 600);
      } else {
        setTestResult('error');
      }
    } catch (err: any) {
      setTestResult('error');
      if (err.response?.data?.error) {
        alert(err.response.data.error);
      }
    } finally {
      setTesting(false);
    }
  }

  const filteredModels = models.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shadow-lg mb-3">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Pick your AI brain.</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          VIMO needs an AI provider to generate content. All calls go through <strong>your own API key</strong> — your data never leaves your machine.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-lg mx-auto">
        {presets.map((preset) => {
          const isSelected = selectedId === preset.id;
          return (
            <div
              key={preset.id}
              className={`relative rounded-xl border-2 p-4 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 shadow-md'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
              }`}
              onClick={() => handleSelect(preset.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{preset.name}</h3>
                {preset.id === 'preset-groq' && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                    Free tier
                  </span>
                )}
                {preset.id === 'preset-ollama' && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    Local
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{preset.description}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpModalProvider({ id: preset.id.replace('preset-', ''), name: preset.name });
                }}
                className="flex items-center text-[11px] font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400"
              >
                How do I get this? <HelpCircle className="ml-1 h-3 w-3" />
              </button>
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && showForm && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="bg-gradient-to-r from-teal-500 to-emerald-600 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">
              Connect {selected.name}
            </h4>
            <p className="text-[11px] text-white/80">Enter your API key below. It is encrypted and stored locally.</p>
          </div>
          <div className="p-5 space-y-4">
            {selected.requiredCredentials.map((cred) => (
              <div key={cred.key}>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {cred.label}
                  {cred.helpUrl && (
                    <a
                      href={cred.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-500"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Get key
                    </a>
                  )}
                </label>
                <input
                  type={cred.isSecret ? 'password' : 'text'}
                  placeholder={cred.placeholder}
                  value={credentials[cred.key] || ''}
                  onChange={(e) => {
                    setCredentials((prev) => ({ ...prev, [cred.key]: e.target.value }));
                    setTestResult(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                />
              </div>
            ))}

            {isDynamicProvider && models.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Model <span className="text-xs text-slate-400">(choose one)</span>
                </label>
                <div className="relative">
                  <div
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 cursor-pointer hover:border-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 flex items-center justify-between"
                    onClick={() => setShowModelPicker(!showModelPicker)}
                  >
                    <span className={selectedModel ? '' : 'text-slate-400'}>
                      {selectedModel || `Pick a model (${models.length} available)`}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
                  </div>
                  {showModelPicker && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-700 max-h-48 overflow-hidden">
                      <div className="p-2 border-b border-slate-100 dark:border-slate-600">
                        <div className="flex items-center gap-2 rounded-md bg-slate-100 dark:bg-slate-600 px-2 py-1">
                          <Search className="h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            placeholder="Search models..."
                            className="bg-transparent text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none flex-1"
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-36">
                        {filteredModels.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-3">No models match your search</p>
                        ) : (
                          filteredModels.map((m) => (
                            <button
                              key={m}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors ${
                                selectedModel === m ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 font-medium' : 'text-slate-700 dark:text-slate-300'
                              }`}
                              onClick={() => {
                                setSelectedModel(m);
                                setShowModelPicker(false);
                                setModelSearch('');
                              }}
                            >
                              {m}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{models.length} models available from {selected.name}</p>
              </div>
            )}

            {isDynamicProvider && modelsLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Loading available models...
              </div>
            )}

            {isDynamicProvider && !modelsLoading && models.length === 0 && credentials.apiKey && credentials.apiKey.length > 5 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Enter a valid API key to see available models.</p>
            )}

            {testResult === 'success' && (
              <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                <Check className="h-4 w-4" />
                Connection verified. Moving on...
              </div>
            )}
            {testResult === 'error' && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                Connection failed. Double-check your key and try again.
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleTestSave}
                disabled={testing || !credentials.apiKey}
                className="rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:from-teal-600 hover:to-emerald-700 disabled:opacity-40 shadow-sm transition-all active:scale-[0.98]"
              >
                {testing ? 'Verifying...' : 'Test & Save'}
              </button>
              <button
                onClick={() => setHelpModalProvider({ id: selected.id.replace('preset-', ''), name: selected.name })}
                className="flex items-center text-xs text-teal-600 hover:text-teal-500 dark:text-teal-400"
              >
                Need help? <ExternalLink className="ml-1 h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center">
        <button
          onClick={onComplete}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors"
        >
          Skip for now — I&apos;ll do this later
        </button>
      </div>

      {helpModalProvider && (
        <HowToGetKeyModal
          provider={helpModalProvider.id}
          providerName={helpModalProvider.name}
          onClose={() => setHelpModalProvider(null)}
        />
      )}
    </div>
  );
}