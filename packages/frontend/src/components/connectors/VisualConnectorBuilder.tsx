import { useState } from 'react';
import api from '../../lib/api';
import { X, Plus } from 'lucide-react';

interface VisualConnectorBuilderProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface CredField {
  key: string;
  label: string;
  placeholder: string;
  isSecret: boolean;
}
interface ToolField {
  name: string;
  description: string;
}

/**
 * Visual Connector Builder — lets a non-technical user assemble a working
 * connector by picking a name, provider, auth type, credential fields, and the
 * actions (tools) it exposes. Posts to the connector builder endpoint which
 * persists a reusable custom preset + a real connector.
 */
export default function VisualConnectorBuilder({ open, onClose, onCreated }: VisualConnectorBuilderProps) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [type, setType] = useState('custom');
  const [authType, setAuthType] = useState<'api_key' | 'oauth2' | 'oauth2_manual' | 'app_password' | 'none'>('api_key');
  const [accountLabel, setAccountLabel] = useState('');
  const [creds, setCreds] = useState<CredField[]>([{ key: 'apiKey', label: 'Access Key', placeholder: '', isSecret: true }]);
  const [tools, setTools] = useState<ToolField[]>([{ name: 'custom_action', description: 'Custom action' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const updateCred = (i: number, patch: Partial<CredField>) =>
    setCreds((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const updateTool = (i: number, patch: Partial<ToolField>) =>
    setTools((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  async function handleCreate() {
    setError('');
    if (!name || !provider) {
      setError('Name and provider are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/connectors/builder', {
        name,
        provider,
        type,
        authType,
        accountLabel: accountLabel || undefined,
        requiredCredentials: creds.filter((c) => c.key),
        tools: tools.filter((t) => t.name),
      });
      setName('');
      setProvider('');
      setAccountLabel('');
      setCreds([{ key: 'apiKey', label: 'Access Key', placeholder: '', isSecret: true }]);
      setTools([{ name: 'custom_action', description: 'Custom action' }]);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create connector.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 sm:pt-20 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Build a Connector</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Connector name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Tool" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Provider key</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="mytool" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <option value="custom">Custom</option>
                <option value="social">Social</option>
                <option value="analytics">Analytics</option>
                <option value="productivity">Productivity</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Auth type</label>
              <select value={authType} onChange={(e) => setAuthType(e.target.value as any)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <option value="api_key">API key</option>
                <option value="oauth2">OAuth 2.0</option>
                <option value="oauth2_manual">OAuth (manual)</option>
                <option value="app_password">App password</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Account label (optional, for multi-account)</label>
            <input value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="e.g. Business account" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Credential fields</span>
              <button onClick={() => setCreds((p) => [...p, { key: '', label: '', placeholder: '', isSecret: true }])} className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline">
                <Plus className="h-3 w-3" /> Add field
              </button>
            </div>
            <div className="space-y-2">
              {creds.map((c, i) => (
                <div key={i} className="grid grid-cols-4 gap-2">
                  <input value={c.key} onChange={(e) => updateCred(i, { key: e.target.value })} placeholder="key" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                  <input value={c.label} onChange={(e) => updateCred(i, { label: e.target.value })} placeholder="Label" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                  <input value={c.placeholder} onChange={(e) => updateCred(i, { placeholder: e.target.value })} placeholder="Placeholder" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                  <button onClick={() => setCreds((p) => p.filter((_, idx) => idx !== i))} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Actions (tools)</span>
              <button onClick={() => setTools((p) => [...p, { name: '', description: '' }])} className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline">
                <Plus className="h-3 w-3" /> Add action
              </button>
            </div>
            <div className="space-y-2">
              {tools.map((t, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input value={t.name} onChange={(e) => updateTool(i, { name: e.target.value })} placeholder="action_name" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                  <input value={t.description} onChange={(e) => updateTool(i, { description: e.target.value })} placeholder="Description" className="col-span-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
                  <button onClick={() => setTools((p) => p.filter((_, idx) => idx !== i))} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">Remove</button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create connector'}
          </button>
        </div>
      </div>
    </div>
  );
}
