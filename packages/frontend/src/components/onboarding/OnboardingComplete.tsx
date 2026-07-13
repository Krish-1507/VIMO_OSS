import { useState, useEffect } from 'react';
import { Check, Sparkles, ArrowRight, Rocket, PartyPopper } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  onFinish: () => void;
}

const MILESTONES = [
  'AI provider connected',
  'Brand profile created',
  'Ready to create & schedule content',
  'Autopilot mode available',
];

export default function OnboardingComplete({ onFinish }: Props) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  function handleOpen() {
    onFinish();
    navigate('/dashboard');
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-4">
        <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-xl shadow-teal-500/30 transition-all duration-500 ${visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          <Rocket className="h-10 w-10 text-white" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center animate-bounce">
          <PartyPopper className="h-4 w-4 text-white" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        You&apos;re all set!
      </h2>
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
        Your AI marketing operations team is ready to go. Here&apos;s what&apos;s waiting for you:
      </p>

      <div className={`mt-6 space-y-2 w-full max-w-sm text-left transition-all duration-500 delay-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {MILESTONES.map((m, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
            <div className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
              <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            </div>
            <span className="text-sm text-slate-700 dark:text-slate-300">{m}</span>
          </div>
        ))}
      </div>

      <div className={`mt-6 flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-900/20 px-5 py-2.5 border border-amber-200 dark:border-amber-800 transition-all duration-500 delay-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <Sparkles className="h-4 w-4 text-amber-500" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Try pressing <kbd className="rounded bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 font-mono text-[10px] font-bold">Cmd+K</kbd> to open VIMO Assistant
        </p>
      </div>

      <button
        onClick={handleOpen}
        className={`mt-6 inline-flex items-center rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 px-10 py-3.5 text-sm font-bold text-white hover:from-teal-600 hover:to-emerald-700 shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 transition-all active:scale-[0.98] ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        Open Dashboard
        <ArrowRight className="ml-2 h-4 w-4" />
      </button>
    </div>
  );
}