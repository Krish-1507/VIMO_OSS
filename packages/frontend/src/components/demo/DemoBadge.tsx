import { DEMO_BADGE_LABEL } from '../../lib/demoMode';

interface Props {
  className?: string;
  size?: 'sm' | 'md';
}

// A small, unmistakable "Demo" badge used next to brand names, avatars, and titles.
export default function DemoBadge({ className = '', size = 'sm' }: Props) {
  const sizing = size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-400 font-bold uppercase tracking-wider text-amber-950 ${sizing} ${className}`}
      title="Sample data — this is a demonstration account, not a real connected brand"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-950/70 animate-pulse" />
      {DEMO_BADGE_LABEL}
    </span>
  );
}
