import { X, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';

export interface Step {
  step: number;
  action: string;
  detail?: string;
}

export const HOW_TO_GET_KEY_STEPS: Record<string, Step[]> = {
  openai: [
    { step: 1, action: "Go to platform.openai.com", detail: "Click the button below to open it. Sign up for a free account if you do not have one." },
    { step: 2, action: "Click your profile icon", detail: "It is in the top-right corner of the page." },
    { step: 3, action: "Select API keys from the menu", detail: "This opens your API key management page." },
    { step: 4, action: "Click Create new secret key", detail: "Give it any name, like VIMO." },
    { step: 5, action: "Copy the key immediately", detail: "OpenAI only shows it once. It starts with sk-. Paste it in VIMO." }
  ],
  anthropic: [
    { step: 1, action: "Go to console.anthropic.com", detail: "Sign up or log in." },
    { step: 2, action: "Click API Keys in the left sidebar" },
    { step: 3, action: "Click Create Key", detail: "Name it VIMO." },
    { step: 4, action: "Copy the key", detail: "It starts with sk-ant-." }
  ],
  groq: [
    { step: 1, action: "Go to console.groq.com", detail: "No credit card needed. Sign up free." },
    { step: 2, action: "Click API Keys in the left menu" },
    { step: 3, action: "Click Create API Key", detail: "Name it VIMO." },
    { step: 4, action: "Copy the key", detail: "It starts with gsk_." }
  ],
  google: [
    { step: 1, action: "Go to aistudio.google.com", detail: "Sign in with your Google account." },
    { step: 2, action: "Click Get API key in the top-left" },
    { step: 3, action: "Click Create API key", detail: "Select a Google Cloud project or create one." },
    { step: 4, action: "Copy the key", detail: "It starts with AIza." }
  ]
};

const PROVIDER_URLS: Record<string, string> = {
  openai: 'https://platform.openai.com',
  anthropic: 'https://console.anthropic.com',
  groq: 'https://console.groq.com',
  google: 'https://aistudio.google.com'
};

interface Props {
  provider: string;
  providerName: string;
  onClose: () => void;
}

export default function HowToGetKeyModal({ provider, providerName, onClose }: Props) {
  const steps = HOW_TO_GET_KEY_STEPS[provider] || [];
  const url = PROVIDER_URLS[provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Getting your {providerName} API key
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
                  {step.step}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{step.action}</p>
                  {step.detail && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{step.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 pt-2">
            {url && (
              <Button
                onClick={() => window.open(url, '_blank')}
                className="w-full"
                variant="primary"
              >
                Open {providerName} website <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            )}
            <Button onClick={onClose} variant="ghost" className="w-full">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
