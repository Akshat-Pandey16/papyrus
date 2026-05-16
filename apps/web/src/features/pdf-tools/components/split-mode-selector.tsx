import { Check, FileStack, Files, Scissors } from "lucide-react";
import { useId } from "react";
import type { SplitMode } from "@/features/pdf-tools/api";
import { cn } from "@/lib/utils";

type Mode = {
  value: SplitMode;
  title: string;
  hint: string;
  Icon: typeof Scissors;
};

const MODES: ReadonlyArray<Mode> = [
  {
    value: "ranges",
    title: "By page ranges",
    hint: "Pick specific ranges (most common).",
    Icon: Scissors,
  },
  {
    value: "every_n",
    title: "Every N pages",
    hint: "Split into equal chunks.",
    Icon: FileStack,
  },
  {
    value: "single_pages",
    title: "One file per page",
    hint: "Each page becomes its own PDF.",
    Icon: Files,
  },
];

export type SplitModeSelectorProps = {
  value: SplitMode;
  onChange: (mode: SplitMode) => void;
  disabled?: boolean | undefined;
};

export function SplitModeSelector({ value, onChange, disabled = false }: SplitModeSelectorProps) {
  const groupId = useId();
  return (
    <fieldset aria-labelledby={`${groupId}-label`} className="flex flex-col gap-2 border-0 p-0">
      <legend id={`${groupId}-label`} className="text-sm font-medium">
        How should we split it?
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map(({ value: mode, title, hint, Icon }) => {
          const selected = mode === value;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(mode)}
              className={cn(
                "group relative flex flex-col items-start gap-1.5 rounded-xl border bg-card p-3 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-foreground/40 ring-1 ring-foreground/20"
                  : "border-border hover:border-foreground/20",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-foreground/5 text-foreground">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                {selected ? <Check className="h-4 w-4 text-foreground" aria-hidden /> : null}
              </div>
              <span className="text-sm font-semibold leading-tight">{title}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
