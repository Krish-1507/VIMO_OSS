import { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

const iconMap = {
  success: { icon: CheckCircle, color: 'text-[var(--green)]' },
  error: { icon: AlertCircle, color: 'text-[var(--red)]' },
  info: { icon: Info, color: 'text-[var(--blue)]' },
};

interface ToastItemProps {
  notification: {
    id: string;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    duration: number;
  };
  onDismiss: (id: string) => void;
}

function ToastItem({ notification, onDismiss }: ToastItemProps) {
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    // Intercept auto-dismiss 250ms before duration expires to show slide-out animation
    const slideOutTimer = setTimeout(() => {
      setIsRemoving(true);
    }, notification.duration - 250);

    return () => clearTimeout(slideOutTimer);
  }, [notification.duration]);

  const handleDismiss = () => {
    setIsRemoving(true);

    // Remove immediately so UI/state tests observe the dismissal synchronously.
    // (Animation can still play via `isRemoving` class.)
    onDismiss(notification.id);

    setTimeout(() => {
      // no-op: keep timer for potential future animation cleanup
    }, 250);
  };

  const currentIcon = iconMap[notification.type] || iconMap.info;
  const Icon = currentIcon.icon;

  return (
    <div
      className={cn(
        "toast-item relative bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-modal p-4 flex items-start gap-3 min-w-[320px] max-w-[400px]",
        isRemoving && "removing"
      )}
    >
      <Icon size={18} className={cn("shrink-0 mt-0.5", currentIcon.color)} />
      <div className="flex-1 pr-6">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          {notification.title}
        </h4>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          {notification.message}
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function Toast() {
  const notifications = useUIStore((s) => s.notifications);
  const removeNotification = useUIStore((s) => s.removeNotification);

  return (
    <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 pb-4 pr-4">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onDismiss={removeNotification} />
      ))}
    </div>
  );
}
