import { Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { type MouseEvent, useId } from "react";
import { springSnappy } from "@/lib/motion";
import { runThemeTransition } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const groupId = useId().replace(/:/g, "");

  const onPick = (value: (typeof OPTIONS)[number]["value"], e: MouseEvent) => {
    if (value === theme) return;
    runThemeTransition(value, () => setTheme(value), { x: e.clientX, y: e.clientY });
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-card/50 p-1 backdrop-blur",
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: animated segmented toggle; radiogroup/radio ARIA is intentional
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={(e) => onPick(value, e)}
            className={cn(
              "relative grid size-7 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`theme-indicator-${groupId}`}
                className="absolute inset-0 rounded-full bg-molten shadow-clay-sm"
                transition={springSnappy}
              />
            ) : null}
            <Icon className="relative z-10 size-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
