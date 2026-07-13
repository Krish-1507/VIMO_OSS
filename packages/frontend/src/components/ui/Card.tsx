import * as React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'md' | 'lg';
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, size = 'md', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-card",
          size === 'lg' ? "p-6" : "p-4",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("border-b border-[var(--border-subtle)] pb-3 mb-4", className)}
        {...props}
      />
    );
  }
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn("text-sm font-semibold text-[var(--text-primary)]", className)}
        {...props}
      />
    );
  }
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn("text-xs text-[var(--text-secondary)] mt-0.5", className)}
        {...props}
      />
    );
  }
);
CardDescription.displayName = "CardDescription";

export { Card, CardHeader, CardTitle, CardDescription };
