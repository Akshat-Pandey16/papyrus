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
  Split,
  Wand2,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useAuthStore } from "@/features/auth/store";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Compress", to: "/tools/compress", icon: Wand2 },
  { label: "Merge", to: "/tools/merge", icon: Layers },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Jobs · soon", to: null, icon: History },
  { label: "Split · soon", to: null, icon: Split },
  { label: "OCR · soon", to: null, icon: ScanLine },
  { label: "Sign · soon", to: null, icon: FileSignature },
  { label: "Redact · soon", to: null, icon: Lock },
] as const;

export function AppMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
          "absolute inset-0 bg-foreground/50 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background shadow-2xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background">
              <FileText className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold">Papyrus</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {ITEMS.map((item) => {
            const active = item.to ? location.pathname === item.to : false;
            const Icon = item.icon;
            const className = cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              !item.to && "cursor-not-allowed opacity-50",
            );
            if (item.to) {
              return (
                <Link key={item.label} to={item.to} onClick={onClose} className={className}>
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            }
            return (
              <span key={item.label} className={className}>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </span>
            );
          })}
        </nav>
        <div className="flex flex-col gap-3 border-t border-border p-4">
          <ThemeToggle />
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background text-xs font-semibold">
              {(user?.fullName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {user?.fullName ?? user?.email ?? "Anonymous"}
              </span>
              <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
