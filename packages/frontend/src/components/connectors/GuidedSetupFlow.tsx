import { useState, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Check,
  Shield,
  Clock,
  LogIn,
} from 'lucide-react';
import api from '../../lib/api';

interface SetupStep {
  stepNumber: number;
  title: string;
  description: string;
  actionUrl?: string;
  screenshotDescription?: string;
  inputField?: { key: string; label: string; placeholder: string; isSecret: boolean };
}

interface SetupGuide {
  title: string;
  estimatedMinutes: number;
  steps: SetupStep[];
  videoGuideUrl?: string;
}

interface GuidedSetupFlowProps {
  guide: SetupGuide;
  provider: string;
  onComplete: (credentials: Record<string, string>) => void;
  onClose: () => void;
}

export default function GuidedSetupFlow({
  guide,
  provider,
  onComplete,
  onClose,
}: GuidedSetupFlowProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const currentStep = guide.steps[currentStepIndex];
  const totalSteps = guide.steps.length;
  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;
  const progress = ((currentStepIndex + 1) / totalSteps) * 100;

  const toggleStepComplete = useCallback((stepNumber: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((i) => i + 1);
      setTestResult(null);
    }
  }, [currentStepIndex, totalSteps]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
      setTestResult(null);
    }
  }, [currentStepIndex]);

  const handleInputChange = useCallback(
    (key: string, value: string) => {
      setCredentialValues((prev) => ({ ...prev, [key]: value }));
      setTestResult(null);
    },
    [],
  );

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await api.post('/api/connectors/test-credentials', {
        provider,
        credentials: credentialValues,
      });
      setTestResult({
        success: res.data.success,
        message: res.data.message || 'Credentials verified!',
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.response?.data?.error || err?.message || 'Connection failed. Please check your credentials.',
      });
    } finally {
      setTesting(false);
    }
  }, [provider, credentialValues]);

  const handleConnect = useCallback(async () => {
    setSaving(true);
    try {
      onComplete(credentialValues);
    } finally {
      setSaving(false);
    }
  }, [credentialValues, onComplete]);

  const hasEnteredRequired = guide.steps
    .filter((s) => s.inputField && s.inputField.key !== 'redirectUri')
    .every((s) => {
      if (!s.inputField) return true;
      return credentialValues[s.inputField.key]?.trim().length > 0;
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {guide.title}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <Clock className="h-4 w-4" />
            Takes about {guide.estimatedMinutes} minutes · Only needs to be done once
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Reassurance banner on first step */}
      {isFirstStep && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
          <Shield className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
          <p className="text-sm text-teal-700 dark:text-teal-300">
            This only takes about {guide.estimatedMinutes} minutes and you only do it once.
            After this, connecting future accounts is one click.
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Step {currentStepIndex + 1} of {totalSteps}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-1.5 rounded-full bg-teal-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step stepper dots */}
      <div className="flex items-center gap-2">
        {guide.steps.map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isCompleted = completedSteps.has(step.stepNumber);
          return (
            <button
              key={step.stepNumber}
              onClick={() => {
                setCurrentStepIndex(idx);
                setTestResult(null);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-teal-600 text-white ring-2 ring-teal-300 ring-offset-2 dark:ring-offset-slate-800'
                  : isCompleted
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}
              title={step.title}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.stepNumber}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="min-h-[280px] space-y-5">
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {currentStep.title}
            </h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {currentStep.description}
            </p>
          </div>

          {/* Action URL button */}
          {currentStep.actionUrl && (
            <a
              href={currentStep.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open {getProviderDisplayName(provider)} ↗
            </a>
          )}

          {/* Screenshot description */}
          {currentStep.screenshotDescription && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-600 dark:bg-slate-900/50">
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                {currentStep.screenshotDescription}
              </p>
            </div>
          )}

          {/* Input field */}
          {currentStep.inputField && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {currentStep.inputField.label}
              </label>
              {currentStep.inputField.key === 'redirectUri' ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 select-all">
                    {currentStep.inputField.placeholder}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(currentStep.inputField!.placeholder);
                    }}
                    className="rounded-lg bg-slate-100 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <input
                  type={currentStep.inputField.isSecret ? 'password' : 'text'}
                  placeholder={currentStep.inputField.placeholder}
                  value={credentialValues[currentStep.inputField.key] || ''}
                  onChange={(e) => handleInputChange(currentStep.inputField!.key, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                />
              )}
            </div>
          )}
        </div>

        {/* Mark as done checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={completedSteps.has(currentStep.stepNumber)}
            onChange={() => toggleStepComplete(currentStep.stepNumber)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200">
            I've completed this step
          </span>
        </label>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            testResult.success
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <div>
            <p
              className={`text-sm font-medium ${
                testResult.success
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-red-800 dark:text-red-300'
              }`}
            >
              {testResult.success ? 'Credentials verified!' : 'Connection failed'}
            </p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {testResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-700">
        <button
          onClick={isFirstStep ? onClose : goBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {isFirstStep ? 'Cancel' : 'Back'}
        </button>

        {isLastStep ? (
          <div className="flex items-center gap-3">
            {/* Test button (separate from Connect) */}
            {!testResult?.success && (
              <button
                onClick={handleTestConnection}
                disabled={testing || !hasEnteredRequired}
                className="inline-flex items-center gap-2 rounded-lg border border-teal-300 px-4 py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950/30 transition-colors"
              >
                {testing ? (
                  <><span className="h-4 w-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /> Testing...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> Test</>
                )}
              </button>
            )}

            {/* Connect button (only shown after successful test) */}
            {(testResult?.success) && (
              <button
                onClick={handleConnect}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connecting...</>
                ) : (
                  <><LogIn className="h-4 w-4" /> Connect</>
                )}
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={goNext}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    instagram_facebook: 'Facebook Developers',
    linkedin: 'LinkedIn Developers',
    google: 'Google Cloud Console',
    github: 'GitHub',
    notion: 'Notion',
    slack: 'Slack API',
    canva: 'Canva Developers',
  };
  return names[provider] || provider;
}
