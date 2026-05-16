import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";

export function AnonymousBanner() {
  const user = useAuthStore((s) => s.user);
  if (!user?.isAnonymous) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">You&apos;re using Papyrus anonymously</span>
          <span className="text-xs text-muted-foreground">
            Sign up to keep job history, get bigger file limits, and run more jobs per day. Free, no
            card.
          </span>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild size="sm">
          <Link to="/signup">Create account</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}
