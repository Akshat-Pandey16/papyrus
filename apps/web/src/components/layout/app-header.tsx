import { useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tools/compress": "Compress PDF",
  "/tools/merge": "Merge PDFs",
  "/tools/split": "Split PDF",
  "/tools/rotate": "Rotate pages",
  "/tools/reorder": "Reorder pages",
  "/tools/ocr": "OCR a PDF",
  "/settings": "Settings",
};

export function AppHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogoutMutation();
  const user = useAuthStore((s) => s.user);
  const title = TITLES[location.pathname] ?? "";

  const handleLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenMobileNav}
          className="grid h-9 w-9 place-items-center rounded-md text-foreground hover:bg-accent md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Papyrus
          </span>
          <h1 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>
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
        <div className="hidden h-9 w-9 place-items-center rounded-full bg-foreground text-background text-xs font-semibold sm:grid">
          {(user?.fullName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
        </div>
      </div>
    </header>
  );
}
