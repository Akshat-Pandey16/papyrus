import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string };

const NAV: readonly NavItem[] = [
  { label: "Tools", href: "/#tools" },
  { label: "Features", href: "/#features" },
];

export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const logout = useLogoutMutation();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-16 w-full items-center justify-between px-6 sm:px-10 lg:px-14">
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-4 w-4" strokeWidth={2.25} />
            </span>
            Papyrus
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
              <Link
                to="/settings"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Settings
              </Link>
              <span className="mx-2 h-5 w-px bg-border" />
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {(user.fullName?.[0] ?? user.email[0] ?? "?").toUpperCase()}
                </div>
                <span className="hidden text-sm text-foreground lg:inline">
                  {user.fullName ?? user.email}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleLogout}
                  disabled={logout.isPending}
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-md text-foreground hover:bg-accent md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={cn("border-t border-border bg-background md:hidden", open ? "block" : "hidden")}
      >
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-6 py-4">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-foreground hover:bg-accent"
            >
              {item.label}
            </a>
          ))}
          <div className="my-2 h-px w-full bg-border" />
          {user ? (
            <>
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Dashboard
              </Link>
              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={logout.isPending}
                className="rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-accent"
              >
                Log out
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link to="/login" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button asChild className="flex-1">
                <Link to="/signup" onClick={() => setOpen(false)}>
                  Get started
                </Link>
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
