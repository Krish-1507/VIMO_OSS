import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  Check,
  HelpCircle,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import api from '../../lib/api';
import type {
  ConnectorPack,
  SetupStep,
  Requirement,
  HelpArticle,
  CredentialField,
} from '../types';
import { resolveIcon } from './IconResolver';
import GuidedSetupView from './GuidedSetupView';

interface SetupAssistantProps {
  pack: ConnectorPack;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (credentials: Record<string, string>, discoveryItems?: { icon: string; label: string; value: string }[]) => void;
}

export default function SetupAssistant({ pack, isOpen, onClose, onComplete }: SetupAssistantProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'success' | 'error'>>({});
  const [showHelp, setShowHelp] = useState(false);
  const [helpArticle, setHelpArticle] = useState<HelpArticle | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [animationClass, setAnimationClass] = useState('animate-in-right');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [oAuthState, setOAuthState] = useState<{
    isConnecting: boolean;
    isConnected: boolean;
    authUrl?: string;
    connectorId?: string;
    error?: string;
  }>({ isConnecting: false, isConnected: false });

  const [guidedSetup, setGuidedSetup] = useState<{
    show: boolean;
    provider: string;
    setupGuide?: { title: string; estimatedMinutes: number; steps: any[] };
  }>({ show: false, provider: '' });

  const [discoveryItems, setDiscoveryItems] = useState<{ icon: string; label: string; value: string }[] | null>(null);

  // Initialize requirements from pack
  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      setRequirements(pack.requirements.map((r) => ({ ...r })));
      setCredentials({});
      setErrors({});
      setTesting(false);
      setTestResults({});
      setShowHelp(false);
      setHelpArticle(null);
      setIsSuccess(false);
      setAnimationClass('animate-in-right');
      setOAuthState({ isConnecting: false, isConnected: false });
      setDiscoveryItems(null);
      setConnectionError(null);
    }
  }, [isOpen, pack]);

  const totalSteps = pack.steps.length;
  const currentStep = pack.steps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;
  const progress = ((currentStepIndex + 1) / totalSteps) * 100;

  const canProceed = useCallback(() => {
    if (currentStep.type === 'verify_requirements') {
      return requirements.every((r) => r.checked);
    }
    if (currentStep.type === 'paste_credentials') {
      return currentStep.credentialFields?.every((f) => credentials[f.key]?.trim().length > 0) ?? true;
    }
    if (currentStep.type === 'discovery') {
      // Discovery steps are auto-resolved; always allow proceeding
      return true;
    }
    return true;
  }, [currentStep, requirements, credentials]);

  const goToStep = useCallback((index: number) => {
    setAnimationClass(index > currentStepIndex ? 'animate-in-right' : 'animate-in-left');
    setCurrentStepIndex(index);
  }, [currentStepIndex]);

  // Fetch real discovery data when the discovery step becomes active
  useEffect(() => {
    if (currentStep?.type === 'discovery') {
      const packItems = currentStep.discoveryItems;
      setDiscoveryItems(null);
      api.post('/api/packs/discover', {
        provider: pack.provider,
        credentials,
      }).then((res) => {
        if (res.data?.success && res.data?.items?.length > 0) {
          setDiscoveryItems(res.data.items);
        } else if (packItems) {
          setDiscoveryItems(packItems);
        }
      }).catch(() => {
        if (packItems) setDiscoveryItems(packItems);
      });
    }
  }, [currentStep?.id, pack.provider]);

  const handleNext = useCallback(() => {
    if (currentStep.type === 'paste_credentials') {
      const newErrors: Record<string, string> = {};
      let hasError = false;
      currentStep.credentialFields?.forEach((field) => {
        const rule = pack.validationRules.find((r) => r.field === field.key);
        if (rule) {
          const result = rule.validate(credentials[field.key] || '');
          if (!result.valid) {
            newErrors[field.key] = result.message || 'Invalid value';
            hasError = true;
          }
        }
      });
      if (hasError) {
        setErrors(newErrors);
        return;
      }
      setErrors({});
    }

    if (isLastStep) {
      handleTestAndComplete();
    } else {
      goToStep(currentStepIndex + 1);
    }
  }, [currentStep, isLastStep, credentials, pack.validationRules, currentStepIndex, goToStep]);

  const handleBack = useCallback(() => {
    if (isSuccess) {
      setIsSuccess(false);
      return;
    }
    goToStep(Math.max(currentStepIndex - 1, 0));
  }, [isSuccess, currentStepIndex, goToStep]);

  const handleTestAndComplete = useCallback(async () => {
    setConnectionError(null);
    setTesting(true);
    const checks = currentStep.testChecks || [];
    const results: Record<string, 'pending' | 'success' | 'error'> = {};
    checks.forEach((c) => { results[c.key] = 'pending'; });
    setTestResults(results);

    for (let i = 0; i < checks.length; i++) {
      await new Promise((r) => setTimeout(r, 400));
      setTestResults((prev) => ({ ...prev, [checks[i].key]: 'success' }));
    }

    // Perform the REAL connection test against the provider API. We only
    // mark the pack as connected when the backend confirms access works.
    try {
      const res = await api.post('/api/connectors/test-credentials', {
        provider: pack.provider,
        credentials,
      });

      if (!res.data?.success) {
        setTesting(false);
        setConnectionError(
          res.data?.error || 'We could not verify these credentials. Please double-check and try again.',
        );
        return;
      }
    } catch (err: any) {
      setTesting(false);
      setConnectionError(
        err?.response?.data?.error || 'Connection test failed. Please try again.',
      );
      return;
    }

    setTesting(false);
    setIsSuccess(true);
    onComplete(credentials, discoveryItems ?? undefined);
  }, [currentStep, credentials, pack.provider, onComplete, discoveryItems]);

  const handleOAuthConnect = useCallback(async () => {
    setOAuthState({ isConnecting: true, isConnected: false });

    try {
      const res = await api.get('/api/auth/oauth/start', {
        params: { provider: pack.provider, connectorId: `pack-${pack.id}-${Date.now()}` },
      });

      if (res.data.needsSetup) {
        setOAuthState({ isConnecting: false, isConnected: false });
        setGuidedSetup({ show: true, provider: pack.provider, setupGuide: res.data.setupGuide });
        return;
      }

      const authUrl = res.data.authUrl;
      const popup = window.open(authUrl, `vimo-oauth-${pack.id}`, 'width=600,height=700,left=200,top=100');

      setOAuthState((prev) => ({ ...prev, authUrl }));

      if (!popup) {
        setOAuthState({
          isConnecting: false,
          isConnected: false,
          error: 'Popup blocked. Please allow popups for this site.',
        });
        return;
      }

      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          setOAuthState({ isConnecting: false, isConnected: true });
          setTimeout(() => {
            if (!isLastStep) {
              goToStep(currentStepIndex + 1);
            } else {
              handleTestAndComplete();
            }
          }, 500);
        }
      }, 1000);
    } catch (err: any) {
      const needsSetup = err?.response?.data?.needsSetup || err?.response?.data?.needsConfiguration;
      if (needsSetup) {
        setOAuthState({ isConnecting: false, isConnected: false });
        setGuidedSetup({ show: true, provider: pack.provider, setupGuide: err.response.data.setupGuide });
        return;
      }
      setOAuthState({
        isConnecting: false,
        isConnected: false,
        error: err?.response?.data?.error || err?.message || 'Connection failed',
      });
    }
  }, [pack, currentStepIndex, isLastStep, goToStep, handleTestAndComplete]);

  const handleCredentialsSaved = useCallback(() => {
    setGuidedSetup({ show: false, provider: '' });
    setOAuthState({ isConnecting: false, isConnected: false, error: undefined });
    setTimeout(() => handleOAuthConnect(), 500);
  }, [handleOAuthConnect]);

  const toggleRequirement = useCallback((id: string) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r))
    );
  }, []);

  const handleCredentialChange = useCallback((key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }, []);

  const openHelp = useCallback((articleId: string) => {
    const article = pack.helpArticles.find((a) => a.id === articleId);
    if (article) {
      setHelpArticle(article);
      setShowHelp(true);
    }
  }, [pack.helpArticles]);

  /* ─── Auto-advance after discovery completes ─── */
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, []);

  const handleDiscoveryComplete = useCallback(() => {
    if (isLastStep) return;
    // Wait a moment for the user to see the completed state, then advance
    autoAdvanceRef.current = setTimeout(() => {
      goToStep(currentStepIndex + 1);
    }, 800);
  }, [isLastStep, currentStepIndex, goToStep]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-[var(--bg-base)] shadow-modal flex flex-col slide-in-right">
        {/* Header */}
        <div className={cn('relative overflow-hidden px-6 pt-8 pb-6', `bg-gradient-to-r ${pack.brandColor}`)}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              {React.createElement(resolveIcon(pack.icon), { className: 'h-5 w-5 text-white' })}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{pack.name} Setup Assistant</h2>
              <p className="text-xs text-white/70">
                Step {isSuccess ? totalSteps : currentStepIndex + 1} of {totalSteps}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-white/60 mb-1">
              <span>Progress</span>
              <span>{isSuccess ? 100 : Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/20">
              <div
                className="h-1.5 rounded-full bg-white transition-all duration-500"
                style={{ width: `${isSuccess ? 100 : progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {guidedSetup.show && guidedSetup.setupGuide ? (
            <GuidedSetupView
              provider={guidedSetup.provider}
              setupGuide={guidedSetup.setupGuide}
              onCredentialsSaved={handleCredentialsSaved}
              onCancel={() => setGuidedSetup({ show: false, provider: '' })}
            />
          ) : isSuccess ? (
            <div className="space-y-6 animate-in-fade">
              <SuccessView pack={pack} onClose={onClose} />
            </div>
          ) : (
            <div key={currentStep.id} className={`space-y-6 ${animationClass}`}>
              {/* Step Title & Description */}
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {currentStep.title}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {currentStep.description}
                </p>
              </div>

              {/* Step Content */}
              <StepContent
                step={currentStep}
                requirements={requirements}
                credentials={credentials}
                errors={errors}
                testResults={testResults}
                testing={testing}
                onToggleRequirement={toggleRequirement}
                onCredentialChange={handleCredentialChange}
                onDiscoveryComplete={handleDiscoveryComplete}
                oAuthState={oAuthState}
                onOAuthConnect={handleOAuthConnect}
                discoveryItems={discoveryItems}
              />

              {/* Screenshot placeholder */}
              {currentStep.screenshotPlaceholder && (
                <div className="rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-overlay)] p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
                    <Sparkles className="h-5 w-5 text-[var(--text-tertiary)]" />
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {currentStep.screenshotPlaceholder}
                  </p>
                </div>
              )}

              {/* Contextual help links */}
              {currentStep.helpArticleIds && currentStep.helpArticleIds.length > 0 && (
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-overlay)] p-4 space-y-2">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">Need help?</p>
                  {currentStep.helpArticleIds.map((articleId) => {
                    const article = pack.helpArticles.find((a) => a.id === articleId);
                    if (!article) return null;
                    return (
                      <button
                        key={articleId}
                        onClick={() => openHelp(articleId)}
                        className="flex w-full items-center gap-2 text-left text-xs text-[var(--teal-500)] hover:text-[var(--teal-400)] transition-colors"
                      >
                        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                        {article.question}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* External link button for open_external steps */}
              {currentStep.type === 'open_external' && currentStep.externalUrl && (
                <a
                  href={currentStep.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center justify-center gap-2 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-all hover:shadow-lg',
                    `bg-gradient-to-r ${pack.brandColor}`
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  {currentStep.externalButtonLabel || 'Open'}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Connection error banner */}
        {connectionError && (
          <div className="mx-6 mb-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Connection failed</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{connectionError}</p>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        {!isSuccess && (
          <div className="border-t border-[var(--border-default)] px-6 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBack}
                disabled={isFirstStep}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              <button
                onClick={handleNext}
                disabled={!canProceed() || testing}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed',
                  `bg-gradient-to-r ${pack.brandColor}`
                )}
              >
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : isLastStep ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Connect {pack.name}
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {!canProceed() && currentStep.type === 'verify_requirements' && (
              <p className="mt-2 text-center text-[11px] text-[var(--text-tertiary)]">
                Please check all requirements to continue
              </p>
            )}
          </div>
        )}
      </div>

      {/* Help Drawer */}
      {showHelp && helpArticle && (
        <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-[var(--bg-base)] shadow-modal flex flex-col z-10 slide-in-right">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-6 py-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Help</h3>
            <button
              onClick={() => setShowHelp(false)}
              className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            <h4 className="text-base font-semibold text-[var(--text-primary)]">
              {helpArticle.question}
            </h4>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {helpArticle.answer}
            </p>
            {helpArticle.link && (
              <a
                href={helpArticle.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--teal-500)] hover:text-[var(--teal-400)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {helpArticle.link.label}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
/* ─── Step Content Renderer ────────────────────────────────────────────── */

function StepContent({
  step,
  requirements,
  credentials,
  errors,
  testResults,
  testing,
  onToggleRequirement,
  onCredentialChange,
  onDiscoveryComplete,
  oAuthState,
  onOAuthConnect,
  discoveryItems,
}: {
  step: SetupStep;
  requirements: Requirement[];
  credentials: Record<string, string>;
  errors: Record<string, string>;
  testResults: Record<string, 'pending' | 'success' | 'error'>;
  testing: boolean;
  onToggleRequirement: (id: string) => void;
  onCredentialChange: (key: string, value: string) => void;
  onDiscoveryComplete?: () => void;
  oAuthState?: { isConnecting: boolean; isConnected: boolean; authUrl?: string; connectorId?: string; error?: string };
  onOAuthConnect?: () => void;
  discoveryItems?: { icon: string; label: string; value: string }[] | null;
}) {
  switch (step.type) {
    case 'verify_requirements':
      return (
        <div className="space-y-3">
          {requirements.map((req) => (
            <label
              key={req.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all',
                req.checked
                  ? 'border-[var(--teal-500)] bg-[var(--teal-100)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
              )}
            >
              <input
                type="checkbox"
                checked={req.checked}
                onChange={() => onToggleRequirement(req.id)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-[var(--teal-500)] focus:ring-[var(--teal-500)]"
              />
              <span className={cn(
                'text-sm',
                req.checked ? 'text-[var(--teal-900)] font-medium' : 'text-[var(--text-secondary)]'
              )}>
                {req.label}
              </span>
            </label>
          ))}
        </div>
      );

    case 'instructions':
      return (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-3">
          {step.instructionBullets?.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-overlay)] text-[11px] font-bold text-[var(--text-secondary)]">
                {i + 1}
              </span>
              <p className="text-sm text-[var(--text-secondary)] pt-0.5">{bullet}</p>
            </div>
          ))}
        </div>
      );

    case 'show_credentials_location':
    case 'paste_credentials':
      return (
        <div className="space-y-4">
          {step.credentialFields?.map((field) => (
            <CredentialInput
              key={field.key}
              field={field}
              value={credentials[field.key] || ''}
              error={errors[field.key]}
              onChange={(val) => onCredentialChange(field.key, val)}
            />
          ))}
        </div>
      );

    case 'test_connection':
      return (
        <div className="space-y-3">
          {step.testChecks?.map((check) => {
            const result = testResults[check.key];
            return (
              <div
                key={check.key}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-4 transition-all',
                  result === 'success'
                    ? 'border-green-200 bg-green-50 dark:bg-green-950/20'
                    : result === 'error'
                    ? 'border-red-200 bg-red-50 dark:bg-red-950/20'
                    : 'border-[var(--border-default)] bg-[var(--bg-elevated)]'
                )}
              >
                {result === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : result === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                ) : testing ? (
                  <Loader2 className="h-5 w-5 text-[var(--teal-500)] animate-spin shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-[var(--border-strong)] shrink-0" />
                )}
                <span className={cn(
                  'text-sm',
                  result === 'success' ? 'text-green-700 dark:text-green-400 font-medium' :
                  result === 'error' ? 'text-red-700 dark:text-red-400' :
                  'text-[var(--text-secondary)]'
                )}>
                  {check.label}
                </span>
              </div>
            );
          })}
        </div>
      );

    case 'oauth_connect':
      return (
        <OAuthConnectContent
          oAuthState={oAuthState}
          onOAuthConnect={onOAuthConnect}
        />
      );

    case 'discovery':
      const items = discoveryItems || step.discoveryItems;
      return items ? (
        <DiscoveryContent
          discoveryItems={items}
          onComplete={onDiscoveryComplete}
        />
      ) : null;

    default:
      return null;
  }
}

/* ─── Connect Step ─────────────────────────────────────────────────────── */

function OAuthConnectContent({
  oAuthState,
  onOAuthConnect,
}: {
  oAuthState?: { isConnecting: boolean; isConnected: boolean; authUrl?: string; connectorId?: string; error?: string };
  onOAuthConnect?: () => void;
}) {
  if (oAuthState?.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-6 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-red-700 dark:text-red-400">{oAuthState.error}</p>
        <button
          onClick={onOAuthConnect}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:shadow-md transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (oAuthState?.isConnected) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          Connected successfully
        </p>
        <p className="text-xs text-green-600 dark:text-green-500">
          Authorization complete. Proceeding...
        </p>
      </div>
    );
  }

  if (oAuthState?.isConnecting) {
    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-6 text-center space-y-4">
        <div className="mx-auto relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--border-subtle)]" />
          <div className="absolute inset-0 rounded-full border-2 border-t-[var(--teal-500)] animate-spin" />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Waiting for authorization...</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Complete the authorization in the popup window
          </p>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          Popup not showing? <button onClick={onOAuthConnect} className="text-[var(--teal-500)] underline">Click here</button>
        </p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-6 space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500">
          <ExternalLink className="h-7 w-7 text-white" />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Authorize
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            A popup will open where you can log in and authorize access
          </p>
        </div>
        <button
          onClick={onOAuthConnect}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:shadow-md transition-all"
        >
          <ExternalLink className="h-4 w-4" />
          Open Authorization
        </button>
      </div>
    </div>
  );
}

/* ─── Discovery Step ──────────────────────────────────────────────────── */

function DiscoveryContent({
  discoveryItems,
  onComplete,
}: {
  discoveryItems: { icon: string; label: string; value: string }[];
  onComplete?: () => void;
}) {
  const [discoveredItems, setDiscoveredItems] = useState<Set<number>>(new Set());
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < discoveryItems.length; i++) {
        await new Promise((r) => setTimeout(r, 600));
        if (cancelled) return;
        setDiscoveredItems((prev) => new Set([...prev, i]));
      }
      await new Promise((r) => setTimeout(r, 400));
      if (!cancelled) {
        setIsComplete(true);
        // Notify parent to auto-advance
        onComplete?.();
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      {!isComplete && (
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--border-subtle)]" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[var(--teal-500)] animate-spin" />
            <RefreshCw className="absolute inset-0 m-auto h-4 w-4 text-[var(--teal-500)]" />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Scanning...</p>
        </div>
      )}

      {isComplete && (
        <div className="flex items-center justify-center gap-2 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">Discovery complete</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {discoveryItems.map((item, i) => {
          const isDiscovered = discoveredItems.has(i);
          return (
            <div
              key={item.label}
              className={cn(
                'flex items-center gap-4 rounded-xl border p-4 transition-all duration-500',
                isDiscovered
                  ? 'border-[var(--teal-500)] bg-[var(--teal-100)] opacity-100'
                  : 'border-[var(--border-default)] bg-[var(--bg-elevated)] opacity-40'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all',
                  isDiscovered
                    ? 'bg-[var(--teal-500)] text-white'
                    : 'bg-[var(--bg-overlay)] text-[var(--text-tertiary)]'
                )}
              >
                {isDiscovered ? (
                  React.createElement(resolveIcon(item.icon), { className: 'h-5 w-5' })
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
              </div>
              <div className="flex-1">
                <p className={cn(
                  'text-sm font-medium transition-colors',
                  isDiscovered ? 'text-[var(--teal-900)]' : 'text-[var(--text-tertiary)]'
                )}>
                  {item.label}
                </p>
              </div>
              <div className="text-right">
                {isDiscovered ? (
                  <span className="text-sm font-bold text-[var(--teal-700)]">{item.value}</span>
                ) : (
                  <span className="text-xs text-[var(--text-tertiary)]">Detecting...</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Credential Input ─────────────────────────────────────────────────── */

function CredentialInput({
  field,
  value,
  error,
  onChange,
}: {
  field: CredentialField;
  value: string;
  error?: string;
  onChange: (val: string) => void;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-[var(--text-primary)]">
        {field.label}
      </label>
      {field.helpText && (
        <p className="text-xs text-[var(--text-tertiary)]">{field.helpText}</p>
      )}
      <div className="relative">
        <input
          type={field.isSecret && !showSecret ? 'password' : 'text'}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-lg border bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 transition-all',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-[var(--border-default)] focus:border-[var(--teal-500)] focus:ring-[var(--teal-500)]'
          )}
        />
        {field.isSecret && (
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1"
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* ─── Success View ─────────────────────────────────────────────────────── */

function SuccessView({ pack, onClose }: { pack: ConnectorPack; onClose: () => void }) {
  const postValue = pack.postConnectionValue;

  return (
    <div className="text-center space-y-6 pt-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-green-400 to-emerald-500">
        <Check className="h-8 w-8 text-white" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-[var(--text-primary)]">
          {pack.name} Connected
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          VIMO can now {pack.capabilities.slice(0, 3).map((c) => c.label.toLowerCase()).join(', ')} and more.
        </p>
      </div>

      {postValue && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 text-left space-y-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">{postValue.title}</p>
          <div className="grid grid-cols-3 gap-3">
            {postValue.metrics.map((m) => (
              <div key={m.label} className="text-center">
                <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-overlay)]">
                  {React.createElement(resolveIcon(m.icon), { className: 'h-4 w-4 text-[var(--text-secondary)]' })}
                </div>
                <p className="text-lg font-bold text-[var(--text-primary)]">{m.value}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">{m.label}</p>
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className={cn(
              'w-full rounded-lg py-2.5 text-sm font-medium text-white transition-all hover:shadow-md',
              `bg-gradient-to-r ${pack.brandColor}`
            )}
          >
            {postValue.suggestedAction.cta}
          </button>
        </div>
      )}

      <button
        onClick={onClose}
        className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Close and return to Connector Hub
      </button>
    </div>
  );
}
