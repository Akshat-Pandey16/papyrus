import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Topbar } from "@/components/layout/topbar";

const HIDE_CHROME_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const hideChrome = HIDE_CHROME_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (hideChrome) {
    return (
      <div className="min-h-svh w-full bg-background text-foreground antialiased">{children}</div>
    );
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-background text-foreground antialiased">
      <Topbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
