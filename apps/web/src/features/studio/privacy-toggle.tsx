import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useUiStore } from "@/stores/ui-store";

export function PrivacyToggle() {
  const zeroRetention = useUiStore((s) => s.zeroRetention);
  const setZeroRetention = useUiStore((s) => s.setZeroRetention);

  return (
    <label
      htmlFor="zero-retention"
      className="flex cursor-pointer items-center justify-between gap-3 px-1"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-primary/70" />
        Zero-retention — erase on download
      </span>
      <Switch id="zero-retention" checked={zeroRetention} onCheckedChange={setZeroRetention} />
    </label>
  );
}
