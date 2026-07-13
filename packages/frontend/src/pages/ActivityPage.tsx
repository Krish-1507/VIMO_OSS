import { useEffect, useState } from 'react';
import { Activity as ActivityIcon, BarChart3 } from 'lucide-react';
import api from '../lib/api';
import DemoBadge from '../components/demo/DemoBadge';
import ActivityFeed, { ActivityItem } from '../components/dashboard/ActivityFeed';
import { isDemoMode } from '../lib/demoMode';
import { DEMO_ACTIVITY } from '../lib/demoData';

export default function ActivityPage() {
  const demoActive = isDemoMode();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (demoActive) {
      setItems(DEMO_ACTIVITY);
      setIsLoading(false);
      return;
    }
    const load = async () => {
      try {
        const res = await api.get('/api/activity');
        setItems(res.data.items || []);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [demoActive]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <BarChart3 className="h-5 w-5 animate-pulse text-teal-500" />
          <span>Loading activity...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500/10">
          <ActivityIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Activity & Transparency</h1>
            {demoActive && <DemoBadge />}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Exactly what VIMO did for your brand, and why. Nothing is hidden.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Recent activity
        </h2>
        <ActivityFeed items={items} />
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        This is a live, plain-language log of your Marketing Director, Autopilot, and publishing — so you always know what ran and can trust the autonomy.
      </p>
    </div>
  );
}
