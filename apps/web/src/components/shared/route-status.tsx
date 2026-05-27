import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function RoutePending() {
  return (
    <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const queryReset = useQueryErrorResetBoundary();
  useEffect(() => {
    queryReset.reset();
  }, [queryReset]);
  return (
    <div className="grid min-h-[50vh] place-items-center px-6">
      <div className="flex max-w-md flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">This page hit a snag</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      </div>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="text-5xl font-bold tracking-tight text-muted-foreground">404</p>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Button asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
