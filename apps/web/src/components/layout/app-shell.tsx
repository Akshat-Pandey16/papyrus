import { useLocation } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { SkipLink } from "@/components/shared/skip-link";
import { ResultsHost } from "@/features/studio/results-host";

const AUTH_FORM_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isAuthForm = AUTH_FORM_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (isAuthForm) {
    return (
      <div className="min-h-svh w-full bg-background text-foreground antialiased">{children}</div>
    );
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-background text-foreground antialiased">
      <SkipLink />
      <TopNav />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </main>
      <ResultsHost />
    </div>
  );
}
