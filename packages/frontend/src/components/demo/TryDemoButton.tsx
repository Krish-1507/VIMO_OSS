import { useNavigate } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';
import { useDemoMode } from '../../lib/demoMode';

// A single, friendly call-to-action used on the login, setup, and system-check screens
// so a brand-new (non-technical) visitor can reach value in 30 seconds.
export default function TryDemoButton({
  variant = 'ghost',
  className = '',
}: {
  variant?: 'ghost' | 'solid';
  className?: string;
}) {
  const enter = useDemoMode((s) => s.enter);
  const navigate = useNavigate();

  const handleClick = () => {
    enter();
    navigate('/dashboard', { replace: true });
  };

  if (variant === 'solid') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 ${className}`}
      >
        <PlayCircle className="h-4 w-4" />
        Try the Demo
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 underline underline-offset-2 transition-colors ${className}`}
    >
      <PlayCircle className="h-3.5 w-3.5" />
      Explore the Demo first
    </button>
  );
}
