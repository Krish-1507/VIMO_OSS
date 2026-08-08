import { useEffect, useState } from 'react';
import axios from 'axios';
import { Cpu, Check, Loader2, RefreshCw, ExternalLink, XCircle } from 'lucide-react';

interface OllamaStatus {
  available: boolean;
  baseUrl?: string;
  models?: { name: string; size?: number }[];
  defaultModel?: string;
}

interface Props {
  onComplete: () => void;
}

export default function LocalAISetupCard({ onComplete }: Props) {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [details, setDetails] = useState<OllamaStatus | null>(null);
  const [alreadyConnected, setAlreadyConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setStatus('checking');
    setError('');
    try {
      const [statusRes, existingRes] = await Promise.all([
        axios.get('/api/connectors/ollama/status'),
        axios.get('/api/connectors').catch(() => ({ data: [] as any[] })),
      ]);
      const data: OllamaStatus = statusRes.data;
      const existing = (existingRes.data || []).some(
        (c: any) => c.provider === 'ollama' && c.status === 'active',
      );
      setDetails(data);
      setAlreadyConnected(existing);
      setStatus(data.available ? 'available' : 'offline');
    } catch {
      setStatus('offline');
      setDetails(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleUseLocalAI() {
    if (!details) return;
    setConnecting(true);
    setError('');
    try {
      let connectorId: string | null = null;
      if (alreadyConnected) {
        const res = await axios.get('/api/connectors');
        connectorId = (res.data || []).find((c: any) => c.provider === 'ollama')?.id || null;
      } else {
        const createRes = await axios.post('/api/connectors', {
          name: 'Ollama',
          type: 'llm',
          provider: 'ollama',
          status: 'active',
          config: {
            baseUrl: details.baseUrl || 'http://localhost:11434',
            modelName: details.defaultModel || 'llama3',
          },
          credentials: {},
        });
        connectorId = createRes.data?.id || null;
      }
      if (!connectorId) {
        setError('Could not set up the local AI. Please try again.');
        return;
      }
      const testRes = await axios.post(`/api/connectors/${connectorId}/test`);
      if (testRes.data.success) {
        setTimeout(() => onComplete(), 600);
      } else {
        setError(testRes.data?.message || 'Could not reach the local AI. Is it still running?');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  if (status === 'checking') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50 flex items-center gap-3 max-w-lg mx-auto">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Checking if your computer can power VIMO&apos;s AI…
        </p>
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50 max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
            <Cpu className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Prefer a free, private AI?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Install Ollama once, and VIMO will run entirely on this computer — no account, no key, nothing ever leaves your machine.
            </p>
          </div>
          <button
            onClick={() => window.open('https://ollama.com/download', '_blank', 'noopener,noreferrer')}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Get Ollama
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <button
          onClick={refresh}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400"
        >
          <RefreshCw className="h-3 w-3" />
          Check again after installing
        </button>
      </div>
    );
  }

  const modelCount = details?.models?.length || 0;
  const previewModels = (details?.models || []).slice(0, 3).map((m) => m.name).join(', ');

  return (
    <div className="rounded-xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-950/30 dark:to-teal-950/20 p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center shrink-0 shadow-md shadow-green-500/20">
          <Cpu className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {alreadyConnected ? 'Your local AI is ready' : 'Found a free AI on this computer'}
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            {alreadyConnected
              ? 'VIMO will use the AI already running on your machine — free and private.'
              : `VIMO found Ollama running here with ${modelCount} model${modelCount === 1 ? '' : 's'} ready${
                  previewModels ? ` (${previewModels})` : ''
                }. Use it free — no account, no key, nothing leaves your computer.`}
          </p>
        </div>
        {alreadyConnected && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
            <Check className="h-3 w-3" />
            Connected
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2.5 rounded-lg">
          <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={handleUseLocalAI}
          disabled={connecting}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-teal-600 px-5 py-2 text-sm font-semibold text-white hover:from-green-600 hover:to-teal-700 disabled:opacity-40 shadow-sm transition-all active:scale-[0.98]"
        >
          {connecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting…
            </>
          ) : alreadyConnected ? (
            'Use this AI'
          ) : (
            'Use free local AI'
          )}
        </button>
        <button
          onClick={refresh}
          disabled={connecting}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 disabled:opacity-40"
        >
          <RefreshCw className="h-3 w-3" />
          Check again
        </button>
      </div>
    </div>
  );
}
