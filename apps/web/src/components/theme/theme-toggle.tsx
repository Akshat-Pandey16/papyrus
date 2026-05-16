import { Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";
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
  const name = useId();

  return (
    <fieldset
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const id = `${name}-${value}`;
        const checked = theme === value;
        return (
          <label
            key={value}
            htmlFor={id}
            aria-label={label}
            className={cn(
              "grid h-7 w-7 cursor-pointer place-items-center rounded transition-colors",
              checked
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={value}
              checked={checked}
              onChange={() => setTheme(value)}
              className="sr-only"
            />
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </label>
        );
      })}
    </fieldset>
  );
}
