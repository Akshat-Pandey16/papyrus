import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";

export function AppHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogoutMutation();
  const user = useAuthStore((s) => s.user);
  const isAnonymous = !!user?.isAnonymous;

  const handleLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/" });
  };

  const isToolRoute = location.pathname.startsWith("/tools");

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenMobileNav}
          className="grid h-9 w-9 place-items-center rounded-md text-foreground hover:bg-accent md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2 md:hidden" aria-label="Papyrus home">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Papyrus</span>
        </Link>

        {isAnonymous && isToolRoute ? (
          <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs md:flex">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">
              Working as a guest. Files auto-delete in 24h.
            </span>
            <Link
              to="/signup"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Save your work →
            </Link>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>
        {isAnonymous ? (
          <>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/signup">Sign up</Link>
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={logout.isPending}
              aria-label="Log out"
              className="md:hidden"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <div className="hidden h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold sm:grid">
              {(user?.fullName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
