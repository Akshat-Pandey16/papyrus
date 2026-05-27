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
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-2 sm:bottom-6">
      <span className="rounded-full bg-popover/90 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase shadow-clay-sm backdrop-blur sm:hidden">
        Tools · tap to switch
      </span>
      <motion.div
        initial={{ y: 56, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...springSnappy, delay: 0.12 }}
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover/95 p-1.5 shadow-clay-lg ring-1 ring-primary/15 backdrop-blur-xl"
      >
        {TOOL_ORDER.map((id) => {
          const tool = TOOLS[id];
          const Icon = tool.icon;
          const active = id === activeTool;
          return (
            <Tip key={id} label={tool.tagline}>
              <motion.button
                type="button"
                onClick={() => onSelect(id)}
                aria-label={tool.label}
                aria-pressed={active}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.94 }}
                transition={springSnappy}
                className={cn(
                  "relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-11 sm:px-3",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
                <span className="relative z-10 hidden text-sm font-medium sm:inline">
                  {tool.label}
                </span>
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
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-11 sm:px-3"
          >
            <Inbox className="relative z-10 size-[1.15rem]" strokeWidth={2.1} />
            <span className="relative z-10 hidden text-sm font-medium sm:inline">Results</span>
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
