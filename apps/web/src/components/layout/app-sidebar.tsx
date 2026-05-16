import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronsLeft,
  ChevronsRight,
  FileSignature,
  FileText,
  History,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  type LucideIcon,
  ScanLine,
  Settings,
  Shuffle,
  Sparkles,
  Split,
  TextSelect,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

type NavItem = {
  label: string;
  to?: string;
  icon: LucideIcon;
  disabled?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Jobs", to: "/jobs", icon: History },
];

const TOOLS_NAV: NavItem[] = [
  { label: "Compress", to: "/tools/compress", icon: Wand2 },
  { label: "Merge", to: "/tools/merge", icon: Layers },
  { label: "Split", to: "/tools/split", icon: Split },
  { label: "Rotate", to: "/tools/rotate", icon: Shuffle },
  { label: "Reorder", to: "/tools/reorder", icon: TextSelect },
  { label: "OCR", to: "/tools/ocr", icon: ScanLine },
  { label: "Sign", icon: FileSignature, disabled: true },
  { label: "Redact", icon: Lock, disabled: true },
];

const FOOTER_NAV: NavItem[] = [{ label: "Settings", to: "/settings", icon: Settings }];

export function AppSidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const navigate = useNavigate();
  const logout = useLogoutMutation();

  const handleLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/" });
  };

  const isAnonymous = !!user?.isAnonymous;

  return (
    <aside
      className={cn(
        "sticky top-0 z-20 hidden h-svh shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-sm transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-[244px]",
      )}
    >
      <button
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggle}
        className="group absolute -right-3 top-[58px] z-30 grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-md shadow-black/5 transition-all hover:scale-110 hover:border-primary/40 hover:bg-primary hover:text-primary-foreground"
      >
        {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
      </button>

      <div
        className={cn(
          "flex h-16 items-center border-b border-border/80 px-3",
          collapsed ? "justify-center" : "justify-start",
        )}
      >
        <Link to="/" className="flex items-center gap-2 px-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <FileText className="h-4 w-4" strokeWidth={2.25} />
          </span>
          {!collapsed ? (
            <span className="text-[15px] font-semibold tracking-tight">Papyrus</span>
          ) : null}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2.5 py-4">
        {!isAnonymous ? (
          <NavSection label="Workspace" collapsed={collapsed} items={PRIMARY_NAV} />
        ) : null}
        <NavSection label="Tools" collapsed={collapsed} items={TOOLS_NAV} />
        {isAnonymous && !collapsed ? <AnonUpsell /> : null}
      </nav>

      <div className="flex flex-col gap-2 border-t border-border/80 px-2.5 py-3">
        {!isAnonymous ? (
          <NavSection label={null} collapsed={collapsed} items={FOOTER_NAV} compact />
        ) : null}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-accent",
            collapsed && "justify-center",
          )}
        >
          <div
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
              isAnonymous ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {(user?.fullName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
          </div>
          {!collapsed ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {isAnonymous ? "Guest" : (user?.fullName ?? user?.email ?? "—")}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {isAnonymous ? "Try without an account" : (organization?.name ?? "Workspace")}
              </span>
            </div>
          ) : null}
          {!collapsed && !isAnonymous ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={logout.isPending}
              aria-label="Log out"
              className="h-8 w-8 p-0"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function AnonUpsell() {
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold tracking-tight">Save your work</span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Keep history, lift size limits, and run more jobs per day.
      </p>
      <div className="mt-1 flex gap-1.5">
        <Button asChild size="sm" className="h-7 flex-1 px-2 text-[11px]">
          <Link to="/signup">Sign up</Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}

function NavSection({
  label,
  items,
  collapsed,
  compact = false,
}: {
  label: string | null;
  items: NavItem[];
  collapsed: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && !collapsed ? (
        <span className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          {label}
        </span>
      ) : null}
      {items.map((item) => (
        <NavLink key={item.label} item={item} collapsed={collapsed} compact={compact} />
      ))}
    </div>
  );
}

function NavLink({
  item,
  collapsed,
  compact,
}: {
  item: NavItem;
  collapsed: boolean;
  compact: boolean;
}) {
  const location = useLocation();
  const active = item.to ? location.pathname === item.to : false;
  const baseClass = cn(
    "group relative flex items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
    compact ? "py-1.5" : "py-2",
    active
      ? "bg-primary/10 text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
    item.disabled &&
      "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
    collapsed && "justify-center px-0",
  );
  const Icon = item.icon;
  const content = (
    <>
      {active && !collapsed ? (
        <span
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary"
          aria-hidden
        />
      ) : null}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} aria-hidden />
      {!collapsed ? (
        <span className={cn("truncate", active && "font-medium")}>{item.label}</span>
      ) : null}
      {!collapsed && item.disabled ? (
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Soon
        </span>
      ) : null}
    </>
  );

  if (!item.to || item.disabled) {
    return (
      <span className={baseClass} aria-disabled={item.disabled || undefined} title={item.label}>
        {content}
      </span>
    );
  }
  return (
    <Link to={item.to} className={baseClass} title={item.label}>
      {content}
    </Link>
  );
}
