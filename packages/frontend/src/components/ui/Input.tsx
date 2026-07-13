import * as React from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | boolean;
  isSecret?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", label, error, isSecret, disabled, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    const inputType = isSecret ? (showPassword ? "text" : "password") : type;

    return (
      <div className="w-full flex flex-col items-start">
        {label && (
          <span className="text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            {label}
          </span>
        )}
        <div className="relative w-full">
          <input
            type={inputType}
            className={cn(
              "w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--teal-500)] focus:ring-1 focus:ring-[var(--teal-500)] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
              error && "border-red-500 ring-red-500 focus:border-red-500 focus:ring-red-500",
              isSecret && "pr-10",
              error && "pr-14",
              className
            )}
            ref={ref}
            disabled={disabled}
            {...props}
          />
          {error && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-red-500 flex items-center justify-center pointer-events-none">
              <AlertCircle size={14} className="stroke-[2.5]" />
            </div>
          )}
          {isSecret && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={disabled}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none p-1 transition-colors"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
        {error && typeof error === 'string' && (
          <span className="text-xs text-red-500 mt-1.5">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
