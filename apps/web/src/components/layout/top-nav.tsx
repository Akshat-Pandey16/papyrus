import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  History,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  ScrollText,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogoutMutation } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { cn } from "@/lib/utils";

const NAV: { to: "/" | "/dashboard" | "/jobs"; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Studio", icon: ScrollText },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: History },
];

export function TopNav() {
  const user = useAuthStore((s) => s.user);
  const hasAccess = useAuthStore((s) => s.hasAccess);
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogoutMutation();
  const isAuthed = hasAccess && !user?.isAnonymous;
  const initial = (user?.fullName?.[0] ?? user?.email?.[0] ?? "P").toUpperCase();

  const isActive = (to: string) =>
    to === "/"
      ? location.pathname === "/" || location.pathname.startsWith("/tools")
      : location.pathname.startsWith(to);

  const handleLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 surface-glass">
      <div className="flex h-16 w-full items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <Link
            to="/"
            aria-label="Papyrus home"
            className="shrink-0 rounded-2xl outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Wordmark />
          </Link>
          {isAuthed ? (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {NAV.map((item) => (
                <NavPill key={item.to} to={item.to} active={isActive(item.to)} icon={item.icon}>
                  {item.label}
                </NavPill>
              ))}
            </nav>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <ThemeToggle />
          {isAuthed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="grid size-10 place-items-center rounded-full bg-molten font-display text-sm font-semibold text-primary-foreground shadow-clay-sm outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {initial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel className="normal-case">
                  {user?.fullName ?? user?.email ?? "Account"}
                </DropdownMenuLabel>
                {NAV.map((item) => (
                  <DropdownMenuItem key={item.to} asChild className="md:hidden">
                    <Link to={item.to}>
                      <item.icon />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="md:hidden" />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="molten">
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavPill({
  to,
  active,
  icon: Icon,
  children,
}: {
  to: "/" | "/dashboard" | "/jobs";
  active: boolean;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
        active
          ? "bg-primary/14 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon />
      {children}
    </Link>
  );
}
