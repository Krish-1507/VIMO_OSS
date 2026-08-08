import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 dark:bg-teal-900/30">
          <Compass className="h-8 w-8 text-teal-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          This page wandered off
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The link you followed doesn't exist in VIMO. Head back to your dashboard and
          keep the marketing running.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
