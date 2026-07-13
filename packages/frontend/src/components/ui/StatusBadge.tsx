import * as React from 'react';
import { cn } from '../../lib/utils';

export type StatusType = 'active' | 'draft' | 'pending' | 'error' | 'published' | 'cancelled' | 'processing';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusType;
}

const statusConfig = {
  active: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-100 dark:border-green-900/30',
    dot: 'bg-green-500',
    label: 'Active'
  },
  draft: {
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    text: 'text-gray-700 dark:text-gray-400',
    border: 'border-gray-100 dark:border-gray-800/30',
    dot: 'bg-gray-400 dark:bg-gray-500',
    label: 'Draft'
  },
  pending: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-100 dark:border-amber-900/30',
    dot: 'bg-amber-500 animate-pulse',
    label: 'Pending'
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-100 dark:border-red-900/30',
    dot: 'bg-red-500',
    label: 'Error'
  },
  published: {
    bg: 'bg-teal-50 dark:bg-teal-950/20',
    text: 'text-teal-700 dark:text-teal-400',
    border: 'border-teal-100 dark:border-teal-900/30',
    dot: 'bg-teal-500',
    label: 'Published'
  },
  cancelled: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-100 dark:border-red-900/30',
    dot: 'bg-red-450 dark:bg-red-500',
    label: 'Cancelled'
  },
  processing: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-100 dark:border-blue-900/30',
    dot: 'bg-blue-500',
    label: 'Processing'
  }
};

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, status, ...props }, ref) => {
    const config = statusConfig[status] || statusConfig.draft;

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border",
          config.bg,
          config.text,
          config.border,
          className
        )}
        {...props}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
        {config.label}
      </span>
    );
  }
);

StatusBadge.displayName = "StatusBadge";

export { StatusBadge };
