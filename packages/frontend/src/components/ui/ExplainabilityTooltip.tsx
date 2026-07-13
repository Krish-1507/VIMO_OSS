import { useState, useRef, useEffect, type ReactNode } from 'react';

export interface Explanation {
  summary: string;
  dataPoints: string[];
  confidence: number;
  method: string;
}

interface ExplainabilityTooltipProps {
  explanation: Explanation;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export default function ExplainabilityTooltip({
  explanation,
  children,
  side = 'bottom',
}: ExplainabilityTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    if (!isVisible || !popoverRef.current || !triggerRef.current) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible]);

  const sideClasses: Record<string, string> = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-slate-800 dark:border-t-slate-600',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-slate-800 dark:border-b-slate-600',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-slate-800 dark:border-l-slate-600',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-slate-800 dark:border-r-slate-600',
  };

  const confidenceColor =
    explanation.confidence >= 80
      ? 'bg-emerald-500'
      : explanation.confidence >= 50
      ? 'bg-amber-500'
      : 'bg-slate-400';

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => !isMobile && setIsVisible(true)}
      onMouseLeave={() => !isMobile && setIsVisible(false)}
      onClick={() => isMobile && setIsVisible(!isVisible)}
      ref={triggerRef}
    >
      {children}

      {/* Popover */}
      {isVisible && (
        <div
          ref={popoverRef}
          className={`absolute z-50 w-72 min-w-max max-w-sm ${sideClasses[side]}`}
          style={{ pointerEvents: 'auto' }}
        >
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 border-4 border-solid ${arrowClasses[side]}`}
          />

          {/* Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            {/* Summary */}
            <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
              {explanation.summary}
            </p>

            {/* Divider */}
            <div className="my-3 border-t border-slate-100 dark:border-slate-700" />

            {/* Data Points */}
            {explanation.dataPoints.length > 0 && (
              <ul className="space-y-2">
                {explanation.dataPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Divider before confidence */}
            <div className="my-3 border-t border-slate-100 dark:border-slate-700" />

            {/* Confidence */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Confidence
                </span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {explanation.confidence}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${confidenceColor}`}
                  style={{ width: `${explanation.confidence}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400 italic">
                Based on {explanation.method}.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
