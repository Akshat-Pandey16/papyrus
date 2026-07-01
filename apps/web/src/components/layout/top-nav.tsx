import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Settings,
} from "lucide-react";
import type { CSSProperties } from "react";
import { LogoMark } from "@/components/brand/logo";
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
import { useStudioChrome } from "@/features/studio/chrome-store";
import { useSessionJobs } from "@/features/studio/session-jobs";
import { useStudioStore } from "@/features/studio/store";
import { TOOLS } from "@/features/studio/tools";
import { cn } from "@/lib/utils";

export function TopNav() {
  const user = useAuthStore((s) => s.user);
  const hasAccess = useAuthStore((s) => s.hasAccess);
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogoutMutation();
  const isAuthed = hasAccess && !user?.isAnonymous;
  const initial = (user?.fullName?.[0] ?? user?.email?.[0] ?? "P").toUpperCase();
  const isStudio = location.pathname === "/" || location.pathname.startsWith("/tools");

  const handleLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            to="/"
            aria-label="Papyrus home"
            className="flex shrink-0 items-center gap-2 rounded-2xl outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogoMark className="size-8 shrink-0" />
            <span className="hidden font-display text-lg font-semibold tracking-tight text-foreground sm:inline">
              Papyrus
            </span>
          </Link>
          <ToolSwitcher studio={isStudio} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {isStudio ? <ResultsButton /> : null}
          <ThemeToggle />
          {isAuthed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="grid size-10 place-items-center rounded-full bg-primary font-display text-sm font-semibold text-primary-foreground outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {initial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel className="normal-case">
                  {user?.fullName ?? user?.email ?? "Account"}
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/jobs">
                    <History />
                    Jobs
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-3 pl-1">
              <Link
                to="/login"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link to="/signup">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ToolSwitcher({ studio }: { studio: boolean }) {
  const activeTool = useStudioStore((s) => s.activeTool);
  const setLauncherOpen = useStudioChrome((s) => s.setLauncherOpen);
  const tool = TOOLS[activeTool];
  const Icon = studio ? tool.icon : LayoutGrid;
  const label = studio ? tool.label : "Tools";

  return (
    <button
      type="button"
      onClick={() => setLauncherOpen(true)}
      aria-label="Switch tool"
      aria-keyshortcuts="Meta+K Control+K"
      className="group inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-card/70 py-1.5 pr-2 pl-2.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-md",
          studio ? "tool-tile" : "bg-primary/10 text-primary",
        )}
        style={studio ? ({ "--tool-hue": tool.hue } as CSSProperties) : undefined}
      >
        <Icon className="size-3.5" strokeWidth={2.2} />
      </span>
      <span className="truncate font-medium text-foreground">{label}</span>
      <kbd className="ml-0.5 hidden rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
        ⌘K
      </kbd>
      <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function ResultsButton() {
  const setResultsOpen = useStudioChrome((s) => s.setResultsOpen);
  const jobs = useSessionJobs();
  const count = jobs.length;
  return (
    <button
      type="button"
      onClick={() => setResultsOpen(true)}
      aria-label={`Results (${count})`}
      className="relative grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Inbox className="size-[1.15rem]" strokeWidth={2.1} />
      {count > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-[17px] place-items-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      ) : null}
    </button>
  );
}
