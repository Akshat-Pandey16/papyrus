import { Inbox } from "lucide-react";
import { motion } from "motion/react";
import { Fragment, type ReactNode } from "react";
import { Tip } from "@/components/ui/tooltip";
import { TOOL_ORDER, TOOLS } from "@/features/studio/tools";
import type { ToolId } from "@/features/studio/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { springSnappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ToolDockProps = {
  activeTool: ToolId;
  onSelect: (tool: ToolId) => void;
  resultsCount: number;
  activeCount: number;
  onOpenResults: () => void;
};

const ITEM_CLASS =
  "relative flex size-9 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-11 sm:w-auto sm:gap-1.5 sm:px-3";

export function ToolDock({
  activeTool,
  onSelect,
  resultsCount,
  activeCount,
  onOpenResults,
}: ToolDockProps) {
  const hoverable = useMediaQuery("(hover: hover)");
  const tip = (label: ReactNode, node: ReactNode, key: string) =>
    hoverable ? (
      <Tip key={key} label={label}>
        {node}
      </Tip>
    ) : (
      <Fragment key={key}>{node}</Fragment>
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-2 sm:bottom-6">
      <span className="max-w-[90vw] truncate rounded-full bg-popover/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-clay-sm backdrop-blur sm:hidden">
        <span className="font-semibold text-foreground">{TOOLS[activeTool].label}</span> ·{" "}
        {TOOLS[activeTool].tagline}
      </span>
      <motion.div
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-0.5 rounded-full border border-border bg-popover/95 p-1 shadow-clay-lg ring-1 ring-primary/15 backdrop-blur-xl sm:gap-1 sm:p-1.5"
      >
        {TOOL_ORDER.map((id) => {
          const tool = TOOLS[id];
          const Icon = tool.icon;
          const active = id === activeTool;
          return tip(
            tool.tagline,
            <motion.button
              type="button"
              onClick={() => onSelect(id)}
              aria-label={tool.label}
              aria-pressed={active}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.94 }}
              transition={springSnappy}
              className={cn(
                ITEM_CLASS,
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
            </motion.button>,
            id,
          );
        })}

        <span className="mx-0.5 h-6 w-px shrink-0 bg-border sm:mx-1 sm:h-7" />

        {tip(
          "Results & downloads",
          <motion.button
            type="button"
            onClick={onOpenResults}
            aria-label={`Results (${resultsCount})`}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            className={cn(
              ITEM_CLASS,
              "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Inbox className="relative z-10 size-[1.15rem]" strokeWidth={2.1} />
            <span className="relative z-10 hidden text-sm font-medium sm:inline">Results</span>
            {resultsCount > 0 ? (
              <span
                className={cn(
                  "absolute -top-1 -right-1 z-10 grid min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] font-bold text-primary-foreground shadow-clay-sm",
                  activeCount > 0 ? "animate-pulse bg-molten" : "bg-primary",
                )}
              >
                {resultsCount}
              </span>
            ) : null}
          </motion.button>,
          "results",
        )}
      </motion.div>
    </div>
  );
}
