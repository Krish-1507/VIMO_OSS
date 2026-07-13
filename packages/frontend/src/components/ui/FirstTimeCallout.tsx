import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  targetSelector: string;
  message: string;
  storageKey: string;
}

export default function FirstTimeCallout({ targetSelector, message, storageKey }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const calloutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === 'dismissed';
    if (isDismissed) return;

    const timer = setTimeout(() => {
      const target = document.querySelector(targetSelector);
      if (target) {
        const rect = target.getBoundingClientRect();
        setCoords({
          top: rect.bottom + window.scrollY + 10,
          left: rect.left + window.scrollX + rect.width / 2,
        });
        setIsVisible(true);
      }
    }, 1000); // Small delay to ensure target is rendered

    return () => clearTimeout(timer);
  }, [targetSelector, storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'dismissed');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={calloutRef}
      className="absolute z-50 flex -translate-x-1/2 flex-col items-center animate-in fade-in zoom-in-95 duration-300"
      style={{ top: coords.top, left: coords.left }}
    >
      {/* Arrow */}
      <div className="h-0 w-0 border-x-[8px] border-b-[10px] border-x-transparent border-b-teal-600" />
      
      {/* Bubble */}
      <div className="w-64 rounded-xl bg-teal-600 p-4 text-white shadow-2xl">
        <div className="flex items-start justify-between space-x-2">
          <p className="text-sm font-medium leading-relaxed">{message}</p>
          <button onClick={handleDismiss} className="rounded-md p-0.5 hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="mt-3 w-full rounded-lg bg-white/20 py-1.5 text-xs font-bold transition-colors hover:bg-white/30"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
