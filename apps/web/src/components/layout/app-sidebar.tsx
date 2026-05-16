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
  Split,
  TextSelect,
  Wand2,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
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
  { label: "Jobs", to: "/jobs", icon: History, disabled: true },
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

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card/40 transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-[248px]",
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-border px-3">
        <Link to="/dashboard" className="flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
            <FileText className="h-4 w-4" strokeWidth={2.25} />
          </span>
          {!collapsed ? (
            <span className="text-sm font-semibold tracking-tight">Papyrus</span>
          ) : null}
        </Link>
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggle}
          className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        {!user?.isAnonymous ? (
          <NavSection label="Workspace" collapsed={collapsed} items={PRIMARY_NAV} />
        ) : null}
        <NavSection label="Tools" collapsed={collapsed} items={TOOLS_NAV} />
      </nav>

      <div className="flex flex-col gap-3 border-t border-border px-3 py-4">
        {!user?.isAnonymous ? (
          <NavSection label={null} collapsed={collapsed} items={FOOTER_NAV} compact />
        ) : null}
        {!collapsed ? <ThemeToggle /> : null}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-accent",
            collapsed && "justify-center",
          )}
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background text-xs font-semibold">
            {(user?.fullName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
          </div>
          {!collapsed ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {user?.isAnonymous ? "Anonymous" : (user?.fullName ?? user?.email ?? "Anonymous")}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user?.isAnonymous
                  ? "Sign up to keep history"
                  : (organization?.name ?? "Workspace")}
              </span>
            </div>
          ) : null}
          {!collapsed && !user?.isAnonymous ? (
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
          {!collapsed && user?.isAnonymous ? (
            <Button asChild size="sm" className="h-8 px-3 text-xs">
              <Link to="/signup">Sign up</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
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
    <div className="flex flex-col gap-1">
      {label && !collapsed ? (
        <span className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
    "group flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
    compact ? "py-1.5" : "py-2",
    active
      ? "bg-foreground text-background"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
    item.disabled &&
      "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
    collapsed && "justify-center px-0",
  );
  const Icon = item.icon;
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {!collapsed && item.disabled ? (
        <span className="ml-auto rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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
