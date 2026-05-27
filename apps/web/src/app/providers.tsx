import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { lazy, type ReactNode, Suspense } from "react";
import { Toaster } from "sonner";
import { GlobalCursor } from "@/components/cursor/global-cursor";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionBootstrap } from "@/features/auth/session-bootstrap";
import { queryClient } from "@/lib/api/query-client";
import { useUiStore } from "@/stores/ui-store";

type AppProvidersProps = {
  children: ReactNode;
};

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : null;

export function AppProviders({ children }: AppProvidersProps) {
  const theme = useUiStore((s) => s.theme);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={200} skipDelayDuration={400}>
            <SessionBootstrap>{children}</SessionBootstrap>
          </TooltipProvider>
        </MotionConfig>
        <Toaster
          position="bottom-right"
          theme={theme}
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "group !rounded-2xl !border-border/70 !bg-popover !text-popover-foreground !shadow-clay-lg",
              title: "!font-medium",
              description: "!text-muted-foreground",
              actionButton: "!bg-primary !text-primary-foreground !rounded-full",
              cancelButton: "!bg-muted !text-muted-foreground !rounded-full",
              closeButton: "!bg-card !border-border !text-muted-foreground",
              error: "!text-destructive",
              success: "!text-success",
            },
          }}
        />
        {ReactQueryDevtools ? (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        ) : null}
        <GlobalCursor />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
