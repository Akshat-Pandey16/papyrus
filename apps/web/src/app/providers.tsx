import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, type ReactNode, Suspense } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { SessionBootstrap } from "@/features/auth/session-bootstrap";
import { queryClient } from "@/lib/api/query-client";

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
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionBootstrap>{children}</SessionBootstrap>
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          theme="system"
          toastOptions={{
            classNames: {
              toast:
                "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
            },
          }}
        />
        {ReactQueryDevtools ? (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
