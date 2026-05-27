import { Link, useLocation } from "@tanstack/react-router";
import {
  FileSignature,
  FileText,
  History,
  Layers,
  LayoutDashboard,
  Lock,
  ScanLine,
  Settings,
  Shuffle,
  Split,
  TextSelect,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to: string | null;
  icon: typeof Wand2;
  group: "workspace" | "tools" | "more";
  soon?: boolean;
};

const ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "workspace" },
  { label: "All jobs", to: "/jobs", icon: History, group: "workspace" },
  { label: "Compress", to: "/tools/compress", icon: Wand2, group: "tools" },
  { label: "Merge", to: "/tools/merge", icon: Layers, group: "tools" },
  { label: "Split", to: "/tools/split", icon: Split, group: "tools" },
  { label: "Rotate", to: "/tools/rotate", icon: Shuffle, group: "tools" },
  { label: "Reorder", to: "/tools/reorder", icon: TextSelect, group: "tools" },
  { label: "OCR", to: "/tools/ocr", icon: ScanLine, group: "tools" },
  { label: "Sign", to: null, icon: FileSignature, group: "tools", soon: true },
  { label: "Redact", to: null, icon: Lock, group: "tools", soon: true },
  { label: "Settings", to: "/settings", icon: Settings, group: "more" },
];

export function AppMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAnonymous = !!user?.isAnonymous;
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
    };

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  const visible = ITEMS.filter((item) => {
    if (item.group === "workspace" && isAnonymous) return false;
    if (item.group === "more" && isAnonymous) return false;
    return true;
  });

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 md:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "absolute inset-0 bg-foreground/50 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col bg-background shadow-2xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-4">
          <Link to="/" onClick={onClose} className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
              <FileText className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold">Papyrus</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <nav aria-label="Mobile" className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {(["workspace", "tools", "more"] as const).map((group) => {
            const items = visible.filter((item) => item.group === group);
            if (items.length === 0) return null;
            const label =
              group === "workspace" ? "Workspace" : group === "tools" ? "Tools" : "More";
            return (
              <div key={group} className="flex flex-col gap-1">
                <span className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                  {label}
                </span>
                {items.map((item) => {
                  const active = item.to ? location.pathname === item.to : false;
                  const Icon = item.icon;
                  const className = cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    !item.to && "cursor-not-allowed opacity-50",
                  );
                  if (item.to) {
                    return (
                      <Link key={item.label} to={item.to} onClick={onClose} className={className}>
                        <Icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
                        <span className={cn(active && "font-medium")}>{item.label}</span>
                      </Link>
                    );
                  }
                  return (
                    <span key={item.label} className={className}>
                      <Icon className="h-[18px] w-[18px]" />
                      <span>{item.label}</span>
                      {item.soon ? (
                        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                          Soon
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="flex flex-col gap-3 border-t border-border p-4">
          <ThemeToggle />
          {isAnonymous ? (
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1" size="sm">
                <Link to="/login" onClick={onClose}>
                  Sign in
                </Link>
              </Button>
              <Button asChild className="flex-1" size="sm">
                <Link to="/signup" onClick={onClose}>
                  Sign up
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                {(user?.fullName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {user?.fullName ?? user?.email ?? "—"}
                </span>
                <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
