import { useState, useEffect } from 'react';
import { LayoutDashboard, Megaphone, Calendar, BarChart3, MessageCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface Props {
  onComplete: () => void;
}

export default function InteractiveTour({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [targetPos, setTargetPos] = useState({ top: 0, left: 0, width: 0, height: 0 });

  useEffect(() => {
    if (step !== 2) return;

    let alive = true;
    let retryTimer: ReturnType<typeof window.setTimeout> | undefined;
    let ro: ResizeObserver | null = null;

    const compute = () => {
      const el = document.getElementById('new-campaign-btn');
      if (!alive || !el) return null;
      const rect = el.getBoundingClientRect();
      setTargetPos({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      return el;
    };

    const tryFind = () => {
      // Let layout settle (animations/loading can shift positions)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = compute();
          if (el) {
            // Keep highlight aligned on resize / layout changes
            ro = new ResizeObserver(() => compute());
            ro.observe(el);
            return;
          }
          retryTimer = setTimeout(tryFind, 250);
        });
      });
    };

    tryFind();

    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (ro) ro.disconnect();
    };
  }, [step]);

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      localStorage.setItem('dashboardTourComplete', 'true');
      onComplete();
    }
  };

  const JOBS = [
    { icon: Megaphone, title: 'Publish', desc: 'VIMO creates and posts your content for you.' },
    { icon: Calendar, title: 'Schedule', desc: 'Plan posts ahead across all your platforms.' },
    { icon: BarChart3, title: 'Analyze', desc: 'See what is working with simple charts.' },
    { icon: MessageCircle, title: 'Engage', desc: 'Reply to comments and messages in one place.' },
  ];

  // If we are in step 2 and neither the highlight nor fallback would show (shouldn't happen),
  // we must ensure we don't block the app.
  const isVisible = step === 1 || step === 2 || step === 3;

  return (
    <div className={cn("fixed inset-0 z-[100] flex items-center justify-center", isVisible ? "pointer-events-auto" : "pointer-events-none")}>
      <div 
        className={cn(
          "absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition-opacity duration-500",
          step === 2 && targetPos.width > 0 ? "opacity-40" : "opacity-100"
        )} 
      />
      
      {step === 1 && (
        <div className="relative z-[101] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center animate-in fade-in zoom-in duration-300 border border-slate-200 dark:border-slate-700">
          <div className="mx-auto w-16 h-16 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center mb-6">
            <LayoutDashboard className="w-8 h-8 text-teal-600 dark:text-teal-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            Welcome to VIMO
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
            Your vibe marketing command center is ready. Let's take a quick tour of what VIMO can do for you — then you'll make your first campaign in seconds.
          </p>
          <Button onClick={handleNext} className="w-full h-12 text-lg font-bold" variant="primary">
            Let's go
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="contents">
          {targetPos.width > 0 ? (
            <>
              <div 
                className="absolute z-[101] rounded-xl border-4 border-teal-500 animate-pulse shadow-[0_0_30px_rgba(20,184,166,0.6)] transition-all duration-500"
                style={{
                  top: targetPos.top - 12,
                  left: targetPos.left - 12,
                  width: targetPos.width + 24,
                  height: targetPos.height + 24,
                }}
              />
              <div 
                className="absolute z-[102] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xs p-6 animate-in slide-in-from-top-8 duration-500 border border-teal-500/30"
                style={{
                  top: targetPos.top + targetPos.height + 30,
                  left: Math.max(20, Math.min(window.innerWidth - 340, targetPos.left - 100)),
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-teal-500 animate-ping" />
                  <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Your first campaign
                  </h4>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                  Click <span className="font-bold text-teal-600 dark:text-teal-400">New Campaign</span> to begin. Just describe your goal in one sentence, and VIMO's AI agents will handle the rest.
                </p>
                <Button onClick={handleNext} className="w-full font-bold" variant="primary">
                  Start Exploring
                </Button>
              </div>
            </>
          ) : (
             <div className="relative z-[101] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center animate-in fade-in zoom-in duration-300 border border-slate-200 dark:border-slate-700">
               <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">
                 Ready to start?
               </h3>
               <p className="text-slate-600 dark:text-slate-400 mb-6">
                 Click the "New Campaign" button in the Quick Actions section to launch your first AI-driven marketing campaign.
               </p>
               <Button onClick={handleNext} className="w-full" variant="primary">
                 Got it
               </Button>
             </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="relative z-[101] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center animate-in fade-in zoom-in duration-300 border border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
            Here's what VIMO does for you
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Four simple jobs, all handled for you.
          </p>
          <div className="grid grid-cols-2 gap-3 text-left mb-7">
            {JOBS.map((job) => {
              const Icon = job.icon;
              return (
                <div
                  key={job.title}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3"
                >
                  <Icon className="h-5 w-5 text-teal-600 dark:text-teal-400 mb-1.5" />
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{job.title}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{job.desc}</p>
                </div>
              );
            })}
          </div>
          <Button onClick={handleNext} className="w-full h-12 text-lg font-bold" variant="primary">
            Start Exploring
          </Button>
        </div>
      )}
    </div>
  );
}
