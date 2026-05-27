import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/observability/report-error";

type Props = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { source: "ErrorBoundary", componentStack: info.componentStack });
  }

  private readonly reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="grid min-h-svh place-items-center bg-background px-6">
          <div className="flex max-w-md flex-col gap-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong.</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={this.reset} variant="outline">
                Try again
              </Button>
              <Button onClick={() => window.location.reload()}>Reload page</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
