import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SelectProps = Omit<ComponentProps<"select">, "size"> & {
  size?: "default" | "sm";
};

export function Select({ className, children, size = "default", ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "w-full appearance-none rounded-xl border border-input bg-card pr-10 pl-3.5 text-[0.95rem] text-foreground shadow-clay-sm outline-none transition-[border-color,box-shadow]",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35",
          "disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-9" : "h-11",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
