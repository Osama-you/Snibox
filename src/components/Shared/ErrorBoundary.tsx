import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-md p-base text-center">
          <p className="text-snippet-title text-text-primary">Something went wrong</p>
          <p className="text-snippet-body text-text-secondary font-mono break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-md py-sm bg-accent text-white rounded-btn hover:bg-accent-hover transition-colors text-snippet-body"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
