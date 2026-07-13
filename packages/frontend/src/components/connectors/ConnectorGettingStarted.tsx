import { Bolt, Instagram, Linkedin, ArrowRight } from 'lucide-react';

interface ConnectorGettingStartedProps {
  onAddConnector: (tab: 'ai' | 'instagram' | 'linkedin') => void;
  onSkip: () => void;
}

export default function ConnectorGettingStarted({
  onAddConnector,
  onSkip,
}: ConnectorGettingStartedProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-8 py-16 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 shadow-lg shadow-teal-200 dark:shadow-teal-900/30">
        <Bolt className="h-10 w-10 text-white" />
      </div>

      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Connect your tools
      </h3>
      <p className="mt-2 max-w-md text-center text-sm text-slate-600 dark:text-slate-400">
        VIMO works best when connected to your accounts. Start with an AI provider
        and one social platform — everything else is optional.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => onAddConnector('ai')}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-teal-200 hover:shadow-lg hover:shadow-teal-300 hover:from-teal-600 hover:to-emerald-600 transition-all"
        >
          <Bolt className="h-4 w-4" />
          Add AI Provider
        </button>
        <button
          onClick={() => onAddConnector('instagram')}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-pink-200 hover:shadow-lg hover:shadow-pink-300 hover:from-pink-600 hover:to-purple-700 transition-all"
        >
          <Instagram className="h-4 w-4" />
          Connect Instagram
        </button>
        <button
          onClick={() => onAddConnector('linkedin')}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 hover:from-blue-700 hover:to-blue-900 transition-all"
        >
          <Linkedin className="h-4 w-4" />
          Connect LinkedIn
        </button>
      </div>

      <button
        onClick={onSkip}
        className="mt-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        Skip for now
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
