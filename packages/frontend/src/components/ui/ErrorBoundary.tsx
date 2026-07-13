import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] w-full items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm dark:border-red-900/30 dark:bg-red-900/20">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <AlertCircle className="h-6 w-6" />
              <h2 className="text-lg font-bold">Something went wrong</h2>
            </div>
            <div className="mt-4">
              <p className="text-sm text-red-700 dark:text-red-300">
                An unexpected error occurred while rendering this component.
              </p>
              <div className="mt-4 overflow-auto rounded bg-red-100 p-3 font-mono text-xs text-red-800 dark:bg-red-900/40 dark:text-red-200">
                {this.state.error?.message || 'Unknown error'}
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 flex w-full items-center justify-center space-x-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <RefreshCcw className="h-4 w-4" />
              <span>Reload page</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
