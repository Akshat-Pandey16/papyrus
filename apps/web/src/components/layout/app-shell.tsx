import { useLocation } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { SkipLink } from "@/components/shared/skip-link";

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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
