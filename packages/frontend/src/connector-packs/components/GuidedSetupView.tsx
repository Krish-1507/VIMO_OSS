import React, { useState, useMemo } from 'react';
import {
  ExternalLink,
  Check,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Shield,
  BookOpen,
  Github,
  PenTool,
  FileText,
  Globe,
  Linkedin,
  Camera,
  MessageCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import api from '../../lib/api';

interface SetupStep {
  stepNumber: number;
  title: string;
  description: string;
  actionUrl?: string;
  inputField?: {
    key: string;
    label: string;
    placeholder: string;
    isSecret: boolean;
  };
}

interface SetupGuide {
  title: string;
  estimatedMinutes: number;
  steps: SetupStep[];
}

interface GuidedSetupViewProps {
  provider: string;
  setupGuide: SetupGuide;
  onCredentialsSaved: () => void;
  onCancel: () => void;
}

const PROVIDER_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  canva: { icon: PenTool, color: 'from-teal-400 to-cyan-600', label: 'Canva' },
  github: { icon: Github, color: 'from-gray-700 to-gray-900', label: 'GitHub' },
  notion: { icon: FileText, color: 'from-gray-600 to-gray-800', label: 'Notion' },
  instagram_facebook: { icon: Camera, color: 'from-pink-500 to-purple-600', label: 'Instagram / Facebook' },
  instagram: { icon: Camera, color: 'from-pink-500 to-purple-600', label: 'Instagram' },
  facebook: { icon: MessageCircle, color: 'from-blue-500 to-blue-700', label: 'Facebook' },
  linkedin: { icon: Linkedin, color: 'from-blue-600 to-blue-800', label: 'LinkedIn' },
  google: { icon: Globe, color: 'from-blue-400 to-red-400', label: 'Google' },
};

/* ─── Providers that use PKCE (no clientSecret needed) ─── */
const PKCE_PROVIDERS = ['github'];

/* ─── Animated step transitions ─── */
function StepContent({ children, stepNumber }: { children: React.ReactNode; stepNumber: number }) {
  return (
    <div className="animate-in-fade" key={stepNumber}>
      {children}
    </div>
  );
}

export default function GuidedSetupView({
  provider,
  setupGuide,
  onCredentialsSaved,
  onCancel,
}: GuidedSetupViewProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const meta = PROVIDER_META[provider] || { icon: Shield, color: 'from-indigo-500 to-purple-500', label: provider };
  const IconComponent = meta.icon;

  const steps = setupGuide.steps;
  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];
  const needsSecret = !PKCE_PROVIDERS.includes(provider);

  // Collect credential fields from steps (clientId, clientSecret, etc.)
  const credentialFields = useMemo(() => {
    return steps
      .filter((s) => s.inputField && (s.inputField.key === 'clientId' || s.inputField.key === 'clientSecret'))
      .map((s) => s.inputField!)
      .filter(Boolean);
  }, [steps]);

  const hasClientId = !!credentials.clientId;
  const hasClientSecret = !needsSecret || !!credentials.clientSecret;
  const canSave = hasClientId && (needsSecret ? hasClientSecret : true);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleSaveCredentials = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = {
        provider,
        clientId: credentials.clientId || '',
      };
      if (needsSecret) {
        payload.clientSecret = credentials.clientSecret || '';
      }
      await api.post('/api/social-accounts/save-credentials', payload);
      setSaved(true);
      setTimeout(() => onCredentialsSaved(), 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save credentials. Please try again.');
    }
    setSaving(false);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  /* ─── Saved confirmation state ─── */
  if (saved) {
    return (
      <div className="text-center space-y-5 py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-bold text-[var(--text-primary)]">Credentials Saved Successfully</p>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
            Your credentials are saved. We&apos;ll now try to connect your account automatically.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header with provider icon ── */}
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r text-white', meta.color)}>
          <IconComponent className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{setupGuide.title}</h3>
          <p className="text-xs text-[var(--text-tertiary)]">
            ~{setupGuide.estimatedMinutes} minute setup &middot; {steps.length} steps
          </p>
        </div>
      </div>

      {/* ── Step progress bar ── */}
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300',
                i < currentStep
                  ? 'bg-green-500 text-white scale-100'
                  : i === currentStep
                  ? 'bg-[var(--teal-500)] text-white scale-110 ring-2 ring-[var(--teal-300)]'
                  : 'bg-[var(--bg-overlay)] text-[var(--text-tertiary)]'
              )}
            >
              {i < currentStep ? <Check className="h-3 w-3" /> : s.stepNumber}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 rounded transition-all duration-500',
                  i < currentStep ? 'bg-green-500' : 'bg-[var(--border-subtle)]'
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step content card ── */}
      {step && (
        <StepContent stepNumber={step.stepNumber}>
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--teal-500)] text-white text-xs font-bold">
                {step.stepNumber}
              </span>
              <div className="space-y-1.5 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</p>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{step.description}</p>
              </div>
            </div>

            {/* ── External link button ── */}
            {step.actionUrl && (
              <a
                href={step.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--teal-50)] dark:bg-teal-950/30 px-3.5 py-2 text-xs font-medium text-[var(--teal-600)] dark:text-[var(--teal-400)] hover:bg-[var(--teal-100)] dark:hover:bg-teal-950/50 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open {step.actionUrl ? new URL(step.actionUrl).hostname.replace('www.', '') : ''}
              </a>
            )}

            {/* ── Copyable redirect link / placeholder ── */}
            {step.inputField && (
              <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {step.inputField.label}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-[var(--bg-overlay)] px-3 py-2.5 text-xs font-mono text-[var(--text-primary)] border border-[var(--border-default)] truncate select-all">
                    {step.inputField.placeholder}
                  </code>
                  <button
                    onClick={() => handleCopy(step.inputField!.placeholder, currentStep)}
                    className="shrink-0 rounded-lg p-2.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedIndex === currentStep ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {step.inputField.key === 'redirectUri' && (
                  <p className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Paste this URL into the &ldquo;Redirect URL&rdquo; or &ldquo;Callback URL&rdquo; field in the developer console
                  </p>
                )}
              </div>
            )}
          </div>
        </StepContent>
      )}

      {/* ── Error message ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ── Credential input section (always visible on last steps) ── */}
      <div className="space-y-3">
        {(isLastStep || step?.inputField?.key === 'clientId' || step?.inputField?.key === 'clientSecret') && (
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                Your {meta.label} API Credentials
              </p>
              {!needsSecret && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
                  PKCE &mdash; No secret needed
                </span>
              )}
            </div>
            {credentialFields.map((field) => (
              <CredentialInput
                key={field.key}
                field={field}
                value={credentials[field.key] || ''}
                onChange={(val) => setCredentials((prev) => ({ ...prev, [field.key]: val }))}
              />
            ))}
          </div>
        )}

        {/* ── Navigation buttons ── */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            disabled={currentStep === 0 || saving}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] disabled:opacity-30 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {isLastStep || credentialFields.length > 0 ? (
            <button
              onClick={handleSaveCredentials}
              disabled={!canSave || saving}
              className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save &amp; Connect
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={currentStep >= steps.length - 1}
              className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:shadow-md disabled:opacity-40 transition-all"
            >
              Next Step
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Skip link ── */}
      <button
        onClick={onCancel}
        className="w-full text-center text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Skip setup for now
      </button>
    </div>
  );
}

/* ─── Credential input with show/hide toggle ─── */
function CredentialInput({
  field,
  value,
  onChange,
}: {
  field: { key: string; label: string; placeholder: string; isSecret: boolean };
  value: string;
  onChange: (val: string) => void;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const isPkce = field.key === 'clientId' && field.label.toLowerCase().includes('client id');

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-[var(--text-secondary)]">
        {field.label}
        {!field.isSecret && (
          <span className="text-red-400 ml-0.5">*</span>
        )}
      </label>
      <div className="relative">
        <input
          type={field.isSecret && !showSecret ? 'password' : 'text'}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-lg border bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all',
            value
              ? 'border-[var(--teal-500)] ring-1 ring-[var(--teal-500)]'
              : 'border-[var(--border-default)] focus:border-[var(--teal-500)] focus:ring-1 focus:ring-[var(--teal-500)]'
          )}
          autoComplete="off"
          spellCheck={false}
        />
        {field.isSecret && (
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {value && !field.isSecret && (
        <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
          <Check className="h-3 w-3" />
          {isPkce ? 'App ID entered' : `${field.label} entered`}
        </p>
      )}
    </div>
  );
}
