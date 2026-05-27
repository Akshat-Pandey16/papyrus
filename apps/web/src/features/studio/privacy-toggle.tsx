import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useUiStore } from "@/stores/ui-store";

export function PrivacyToggle() {
  const zeroRetention = useUiStore((s) => s.zeroRetention);
  const setZeroRetention = useUiStore((s) => s.setZeroRetention);

  return (
    <label
      htmlFor="zero-retention"
      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/40 p-3"
    >
      <span className="flex items-center gap-2.5">
        <ShieldCheck className="size-4 shrink-0 text-primary" />
        <span className="flex flex-col">
          <span className="text-xs font-medium">Zero-retention</span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            Erase from our servers the moment you download
          </span>
        </span>
      </span>
      <Switch id="zero-retention" checked={zeroRetention} onCheckedChange={setZeroRetention} />
    </label>
  );
}
