import { RotateCcw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { crashed: boolean };

export class StudioErrorBoundary extends Component<Props, State> {
  override state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Studio tool crashed", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ crashed: false });
  };

  override render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-clay-sm">
        <span className="grid size-14 place-items-center rounded-2xl bg-molten text-primary-foreground shadow-ember">
          <TriangleAlert className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-xl font-semibold">This tool hit a snag</h3>
          <p className="text-sm text-muted-foreground">
            Something went wrong while working on your file. Your file wasn't lost — reset and try
            again.
          </p>
        </div>
        <Button type="button" variant="molten" size="lg" onClick={this.reset}>
          <RotateCcw />
          Reset
        </Button>
      </div>
    );
  }
}
