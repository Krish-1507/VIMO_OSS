import { useState, useEffect } from 'react';
import { useOnboardingStore } from '../../stores/onboardingStore';
import OnboardingWelcome from './OnboardingWelcome';
import OnboardingLLMSetup from './OnboardingLLMSetup';
import OnboardingBrandSetup from './OnboardingBrandSetup';
import OnboardingConnectSocial from './OnboardingConnectSocial';
import OnboardingComplete from './OnboardingComplete';
import { ArrowLeft } from 'lucide-react';

const STEPS = ['welcome', 'llm', 'brand', 'social', 'complete'];
const STEP_NAMES = ['Welcome', 'Your AI', 'Brand Setup', 'Connect', 'Ready'];

export default function OnboardingWizard() {
  const { currentStep, nextStep, prevStep, completeStep, finishOnboarding, loadStatus } = useOnboardingStore();
  const [mounted, setMounted] = useState(false);
  const [animDir, setAnimDir] = useState<'forward' | 'back'>('forward');

  useEffect(() => {
    loadStatus().then(() => setMounted(true));
  }, [loadStatus]);

  const handleNext = () => {
    setAnimDir('forward');
    nextStep();
  };

  const handleBack = () => {
    setAnimDir('back');
    prevStep();
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" aria-modal="true" role="dialog">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-800 max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="p-6 pb-0">
          <div className="flex items-center gap-3 mb-3">
            {currentStep > 0 && currentStep < STEPS.length - 1 && (
              <button
                onClick={handleBack}
                className="flex items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </button>
            )}
            <div className="flex-1 flex items-center gap-1.5">
              {STEP_NAMES.map((_, i) => (
                <div key={i} className="flex items-center gap-1.5 flex-1">
                  <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                    i <= currentStep ? 'bg-teal-500' : 'bg-slate-200 dark:bg-slate-700'
                  }`} />
                </div>
              ))}
            </div>
            <span className="text-[10px] font-mono text-slate-400 shrink-0">
              {currentStep + 1}/{STEPS.length}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 dark:text-slate-500 mb-4 px-0.5">
            {STEP_NAMES.map((n, i) => (
              <span key={i} className={`transition-colors duration-300 ${
                i === currentStep ? 'text-teal-600 dark:text-teal-400 font-semibold' :
                i < currentStep ? 'text-teal-500/60' : ''
              }`}>
                {n}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto max-h-[75vh] p-6 pt-2">
          <div className={`transition-all duration-300 ${
            animDir === 'forward'
              ? 'animate-in slide-in-from-right-4 fade-in'
              : 'animate-in slide-in-from-left-4 fade-in'
          }`}>
            <StepContent
              step={currentStep}
              onNext={handleNext}
              onFinish={finishOnboarding}
              completeStep={completeStep}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepContent({ step, onNext, onFinish, completeStep }: {
  step: number;
  onNext: () => void;
  onFinish: () => void;
  completeStep: (name: string) => Promise<void>;
}) {
  switch (step) {
    case 0:
      return <OnboardingWelcome onNext={() => { completeStep('welcome'); onNext(); }} />;
    case 1:
      return <OnboardingLLMSetup onComplete={() => { completeStep('llm'); onNext(); }} />;
    case 2:
      return <OnboardingBrandSetup onComplete={() => { completeStep('brand'); onNext(); }} />;
    case 3:
      return <OnboardingConnectSocial onComplete={() => { completeStep('social'); onNext(); }} />;
    case 4:
      return <OnboardingComplete onFinish={onFinish} />;
    default:
      return null;
  }
}