import { HelpCircle } from 'lucide-react';

interface Props {
  onClick: () => void;
}

export default function HelpButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="fixed right-6 top-4 z-40 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 shadow-md ring-1 ring-slate-200 transition-all hover:text-teal-500 hover:ring-teal-500/30 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700 dark:hover:text-teal-400"
      title="Need help?"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
