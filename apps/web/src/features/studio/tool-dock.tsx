import { Inbox } from "lucide-react";
import { motion } from "motion/react";
import { Tip } from "@/components/ui/tooltip";
import { TOOL_ORDER, TOOLS } from "@/features/studio/tools";
import type { ToolId } from "@/features/studio/types";
import { springSnappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ToolDockProps = {
  activeTool: ToolId;
  onSelect: (tool: ToolId) => void;
  resultsCount: number;
  activeCount: number;
  onOpenResults: () => void;
};

export function ToolDock({
  activeTool,
  onSelect,
  resultsCount,
  activeCount,
  onOpenResults,
}: ToolDockProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-2 sm:bottom-6">
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...springSnappy, delay: 0.1 }}
        className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border/70 surface-glass p-1.5 shadow-clay-lg sm:gap-1"
      >
        {TOOL_ORDER.map((id) => {
          const tool = TOOLS[id];
          const Icon = tool.icon;
          const active = id === activeTool;
          return (
            <Tip key={id} label={tool.label}>
              <motion.button
                type="button"
                onClick={() => onSelect(id)}
                aria-label={tool.label}
                aria-pressed={active}
                whileHover={{ y: -6, scale: 1.14 }}
                whileTap={{ scale: 0.92 }}
                transition={springSnappy}
                className={cn(
                  "relative grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-11",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="dock-active-pill"
                    className="absolute inset-0 rounded-full bg-molten shadow-clay-sm"
                    transition={springSnappy}
                  />
                ) : null}
                <Icon className="relative z-10 size-[1.15rem]" strokeWidth={2.1} />
              </motion.button>
            </Tip>
          );
        })}

        <span className="mx-0.5 h-7 w-px shrink-0 bg-border sm:mx-1" />

        <Tip label="Results & downloads">
          <motion.button
            type="button"
            onClick={onOpenResults}
            aria-label={`Results (${resultsCount})`}
            whileHover={{ y: -6, scale: 1.14 }}
            whileTap={{ scale: 0.92 }}
            transition={springSnappy}
            className="relative grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:size-11"
          >
            <Inbox className="size-[1.15rem]" strokeWidth={2.1} />
            {resultsCount > 0 ? (
              <span
                className={cn(
                  "absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] font-bold text-primary-foreground shadow-clay-sm",
                  activeCount > 0 ? "animate-pulse bg-molten" : "bg-primary",
                )}
              >
                {resultsCount}
              </span>
            ) : null}
          </motion.button>
        </Tip>
      </motion.div>
    </div>
  );
}
