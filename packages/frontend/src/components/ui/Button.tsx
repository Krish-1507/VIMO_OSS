import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-none",
  {
    variants: {
      variant: {
        primary: "bg-[var(--teal-500)] text-white hover:bg-[var(--teal-400)] focus-visible:ring-[var(--teal-500)]",
        secondary: "bg-[var(--bg-overlay)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--border-subtle)] focus-visible:ring-[var(--teal-500)]",
        destructive: "bg-[var(--red)] text-white hover:bg-red-500 focus-visible:ring-[var(--red)]",
        ghost: "bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] focus-visible:ring-[var(--teal-500)]",
      },
      size: {
        sm: "h-7 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <span className="h-[14px] w-[14px] border-2 rounded-full border-white border-t-transparent animate-spin inline-block shrink-0" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
