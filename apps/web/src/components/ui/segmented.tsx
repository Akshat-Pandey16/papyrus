import { motion } from "motion/react";
import { type ReactNode, useId } from "react";
import { springSnappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
};

export type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
  ariaLabel?: string;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  className,
  size = "default",
  ariaLabel,
}: SegmentedProps<T>) {
  const groupId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full items-stretch gap-1 rounded-full border border-border/60 bg-muted/60 p-1",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: animated segmented control; radiogroup/radio ARIA is intentional
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-full font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`segmented-${groupId}`}
                className="absolute inset-0 rounded-full bg-molten shadow-clay-sm"
                transition={springSnappy}
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5 [&_svg]:size-4">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
