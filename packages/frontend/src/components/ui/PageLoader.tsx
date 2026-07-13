import { Loader2 } from 'lucide-react';

export function PageLoader() {
  return (
    <div className="flex min-h-[400px] w-full flex-col items-center justify-center space-y-4 p-12">
      <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
      <p className="animate-pulse text-sm font-medium text-slate-500 dark:text-slate-400">
        Loading...
      </p>
    </div>
  );
}
