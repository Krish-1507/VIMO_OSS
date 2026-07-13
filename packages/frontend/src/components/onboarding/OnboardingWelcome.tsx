import { useState } from 'react';
import {
  ArrowRight,
  Sparkles,
  Bot,
  BarChart3,
  Calendar,
  Globe,
  Zap,
  Megaphone,
  MessageCircle,
} from 'lucide-react';

interface Props {
  onNext: () => void;
}

// The plain-language promise shown first: four verbs a non-technical person cares about.
const JOBS = [
  { icon: Megaphone, title: 'Publish', desc: 'Create and post content in your brand voice — no writer needed.' },
  { icon: Calendar, title: 'Schedule', desc: 'Plan posts ahead so your channels stay active while you sleep.' },
  { icon: BarChart3, title: 'Analyze', desc: 'See what is working with simple, plain-English reports.' },
  { icon: MessageCircle, title: 'Engage', desc: 'Reply to comments and messages from one place, fast.' },
];

const CAPABILITIES = [
  { icon: Bot, title: 'AI Content Engine', desc: 'Writes posts, captions, hashtags, and reels scripts in your brand voice' },
  { icon: Calendar, title: 'Smart Scheduling', desc: 'Plans and schedules content across all your platforms' },
  { icon: BarChart3, title: 'Analytics & Insights', desc: 'Tracks performance, spots trends, and tells you what works' },
  { icon: Globe, title: 'Multi-Platform', desc: 'Instagram, TikTok, LinkedIn, Twitter, Facebook & more' },
  { icon: Zap, title: 'Autopilot Mode', desc: 'Set a goal and let VIMO run your marketing autonomously' },
  { icon: Sparkles, title: 'Viral Studio', desc: 'Detects viral moments in your videos and creates clips' },
];

export default function OnboardingWelcome({ onNext }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-5 relative">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-teal-500/20">
          <Bot className="h-10 w-10 text-white" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center animate-bounce">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Welcome to VIMO
      </h1>
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-md">
        Your AI marketing team. Connect your accounts and VIMO writes, schedules, and analyzes your content — you stay in control.
      </p>

      {/* What VIMO will do for you */}
      <div className="mt-5 w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
          What VIMO will do for you
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {JOBS.map((job) => {
            const Icon = job.icon;
            return (
              <div key={job.title} className="flex items-start gap-2">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{job.title}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{job.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 max-w-md">
        Feel free to explore instantly with the built-in Demo, or connect popular accounts like GitHub, Notion, and Canva with one click — no keys needed.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2.5 w-full max-w-lg text-left">
        {CAPABILITIES.map((cap, i) => {
          const Icon = cap.icon;
          return (
            <div
              key={i}
              className={`rounded-xl border p-3 transition-all duration-200 cursor-default ${
                hoveredIdx === i
                  ? 'border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20 shadow-sm'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50'
              }`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <Icon className={`h-4 w-4 mb-1.5 transition-colors ${
                hoveredIdx === i ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
              }`} />
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{cap.title}</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{cap.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-900/20 px-4 py-2 border border-amber-200 dark:border-amber-800">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Takes about 2 minutes. No credit card needed to start.
        </p>
      </div>

      <button
        onClick={onNext}
        className="mt-5 inline-flex items-center rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 px-8 py-3 text-sm font-semibold text-white hover:from-teal-600 hover:to-emerald-700 shadow-lg shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/30 transition-all active:scale-[0.98]"
      >
        Let&apos;s set up VIMO
        <ArrowRight className="ml-2 h-4 w-4" />
      </button>
    </div>
  );
}