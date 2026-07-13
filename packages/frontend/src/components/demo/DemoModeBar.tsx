import { useNavigate } from 'react-router-dom';
import { LogOut, Eye } from 'lucide-react';
import { useDemoMode, DEMO_BADGE_LABEL } from '../../lib/demoMode';
import { useAuthStore } from '../../stores/authStore';

// Persistent banner shown across the whole app while Demo Mode is active.
// It reassures the user the data is sample data and gives a one-click exit.
export default function DemoModeBar() {
  const { exit } = useDemoMode();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  const handleExit = () => {
    exit();
    clearAuth();
    try { localStorage.removeItem('session_token'); } catch { /* ignore */ }
    navigate('/setup');
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-1.5 text-amber-950 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium sm:text-sm">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          <Eye className="h-3 w-3" />
          {DEMO_BADGE_LABEL}
        </span>
        <span className="hidden sm:inline">
          You&apos;re exploring a sample brand with made-up posts and numbers. Nothing here is real.
        </span>
        <span className="sm:hidden">Sample data — nothing here is real.</span>
      </div>
      <button
        onClick={handleExit}
        className="inline-flex items-center gap-1 rounded-full bg-amber-950/15 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-amber-950/25"
        title="Leave Demo Mode and set up your own brand"
      >
        <LogOut className="h-3 w-3" />
        Exit Demo
      </button>
    </div>
  );
}
