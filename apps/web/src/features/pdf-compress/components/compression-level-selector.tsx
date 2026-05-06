import { Check } from "lucide-react";
import { useId } from "react";
import type { CompressionLevel } from "@/features/pdf-compress/types";
import { cn } from "@/lib/utils";

const LEVELS: ReadonlyArray<{
  value: CompressionLevel;
  title: string;
  hint: string;
  detail: string;
}> = [
  {
    value: "low",
    title: "Light",
    hint: "Lossless · ~5–10% smaller",
    detail: "Best for text-heavy PDFs. Preserves quality exactly.",
  },
  {
    value: "medium",
    title: "Balanced",
    hint: "~20–30% smaller",
    detail: "Good for most documents. Imperceptible quality change.",
  },
  {
    value: "high",
    title: "Maximum",
    hint: "Lossy · up to ~50% smaller",
    detail: "Best for image-heavy PDFs. Re-encodes embedded images.",
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
  return (
    <fieldset aria-labelledby={`${groupId}-label`} className="flex flex-col gap-2 border-0 p-0">
      <legend id={`${groupId}-label`} className="text-sm font-medium">
        Compression level
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
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
                "group relative flex min-h-[112px] flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-foreground/40 ring-1 ring-foreground/20"
                  : "border-border hover:border-foreground/20",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-base font-semibold">{level.title}</span>
                {selected ? <Check className="h-4 w-4 text-foreground" aria-hidden /> : null}
              </div>
              <span className="text-xs font-medium text-muted-foreground">{level.hint}</span>
              <span className="text-xs text-muted-foreground">{level.detail}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
