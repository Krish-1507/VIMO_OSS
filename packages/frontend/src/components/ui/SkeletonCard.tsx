export function SkeletonCard() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center space-x-4">
        <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1 space-y-3 py-1">
          <div className="h-4 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 h-4 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="col-span-1 h-4 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-4 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-4/6 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
