import { Check } from "lucide-react";
import { useId } from "react";
import type { CompressionLevel } from "@/features/pdf-compress/types";
import { cn } from "@/lib/utils";

const LEVELS: ReadonlyArray<{
  value: Exclude<CompressionLevel, "custom">;
  title: string;
  hint: string;
  detail: string;
}> = [
  {
    value: "low",
    title: "Light",
    hint: "Lossless · ~5–10% smaller",
    detail: "Preserves images and quality exactly.",
  },
  {
    value: "medium",
    title: "Balanced",
    hint: "~20–35% smaller",
    detail: "Smart image downsample. Imperceptible quality drop.",
  },
  {
    value: "high",
    title: "Strong",
    hint: "~40–60% smaller",
    detail: "Lossy images, strip metadata. Web-ready quality.",
  },
  {
    value: "extreme",
    title: "Extreme",
    hint: "Up to ~80% smaller",
    detail: "Grayscale + aggressive image downsample. Scans only.",
  },
];

export type CompressionLevelSelectorProps = {
  value: CompressionLevel;
  onChange: (level: CompressionLevel) => void;
  disabled?: boolean;
};

export function CompressionLevelSelector({
  value,
  onChange,
  disabled = false,
}: CompressionLevelSelectorProps) {
  const groupId = useId();
  const isCustom = value === "custom";
  return (
    <fieldset aria-labelledby={`${groupId}-label`} className="flex flex-col gap-2 border-0 p-0">
      <div className="flex items-baseline justify-between gap-2">
        <legend id={`${groupId}-label`} className="text-sm font-medium">
          Compression preset
        </legend>
        {isCustom ? (
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
            Custom
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
        {LEVELS.map((level) => {
          const selected = level.value === value;
          return (
            <button
              key={level.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(level.value)}
              className={cn(
                "group relative flex min-h-[100px] flex-col items-start gap-1 rounded-xl border bg-card p-3.5 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-foreground/40 ring-1 ring-foreground/20"
                  : "border-border hover:border-foreground/20",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-semibold">{level.title}</span>
                {selected ? <Check className="h-4 w-4 text-foreground" aria-hidden /> : null}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{level.hint}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{level.detail}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
