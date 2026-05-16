import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppMobileDrawer } from "@/components/layout/app-mobile-drawer";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthStore } from "@/features/auth/store";

const PUBLIC_PREFIXES = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];
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
  const isPublicLanding = PUBLIC_PREFIXES.includes(location.pathname);

  if (isAppRoute && hasAccess) {
    return (
      <div className="flex min-h-svh w-full bg-background text-foreground antialiased">
        <AppSidebar />
        <AppMobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader onOpenMobileNav={() => setDrawerOpen(true)} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full flex-col bg-background text-foreground antialiased">
      <Topbar />
      <main className="flex-1">{children}</main>
      {!isPublicLanding ? null : null}
    </div>
  );
}
