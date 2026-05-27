import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

export function ZeroRetentionToggle({ className }: { className?: string }) {
  const enabled = useUiStore((s) => s.zeroRetention);
  const setEnabled = useUiStore((s) => s.setZeroRetention);
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3",
        className,
      )}
    >
      <ShieldCheck
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-semibold">Zero-retention</span>
        <span className="text-[11px] leading-relaxed text-muted-foreground">
          Delete the uploaded file from storage the moment your result is ready.
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle zero-retention"
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          enabled ? "bg-emerald-600 dark:bg-emerald-500" : "bg-foreground/20",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
            enabled ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
