import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type ProgressProps = {
  value?: number;
  indeterminate?: boolean;
  className?: string;
};

export function Progress({ value = 0, indeterminate = false, className }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {indeterminate ? (
        <motion.div
          className="absolute inset-y-0 w-2/5 rounded-full bg-molten"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className="h-full rounded-full bg-molten"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        />
      )}
    </div>
  );
}
