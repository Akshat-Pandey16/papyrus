import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppMobileDrawer } from "@/components/layout/app-mobile-drawer";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SkipLink } from "@/components/shared/skip-link";
import { useAuthStore } from "@/features/auth/store";

const AUTH_FORM_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];
const APP_PREFIXES = ["/dashboard", "/tools", "/settings", "/jobs"];

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const hasAccess = useAuthStore((s) => s.hasAccess);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAuthForm = AUTH_FORM_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (isAuthForm) {
    return (
      <div className="min-h-svh w-full bg-background text-foreground antialiased">{children}</div>
    );
  }

  const isAppRoute = APP_PREFIXES.some((p) => location.pathname.startsWith(p));
  const isToolRoute = location.pathname.startsWith("/tools");

  if ((isAppRoute && hasAccess) || (isToolRoute && hasAccess)) {
    return (
      <div className="flex min-h-svh w-full bg-background text-foreground antialiased">
        <SkipLink />
        <AppSidebar />
        <AppMobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader onOpenMobileNav={() => setDrawerOpen(true)} />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-background text-foreground antialiased">
      <SkipLink />
      <Topbar />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
    </div>
  );
}
