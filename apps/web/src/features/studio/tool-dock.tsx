import { ChevronDown, Inbox, LayoutGrid } from "lucide-react";
import { motion } from "motion/react";
import { Tip } from "@/components/ui/tooltip";
import { TOOLS } from "@/features/studio/tools";
import type { ToolId } from "@/features/studio/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { springSnappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ToolDockProps = {
  activeTool: ToolId;
  onOpenLauncher: () => void;
  resultsCount: number;
  onOpenResults: () => void;
};

export function ToolDock({
  activeTool,
  onOpenLauncher,
  resultsCount,
  onOpenResults,
}: ToolDockProps) {
  const hoverable = useMediaQuery("(hover: hover)");
  const tool = TOOLS[activeTool];
  const Icon = tool.icon;

  const resultsBtn = (
    <button
      type="button"
      onClick={onOpenResults}
      aria-label={`Results (${resultsCount})`}
      className="relative grid size-11 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Inbox className="size-[1.15rem]" strokeWidth={2.1} />
      {resultsCount > 0 ? (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] font-bold text-primary-foreground shadow-clay-sm",
            "bg-primary",
          )}
        >
          {resultsCount}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-2 sm:bottom-6">
      <motion.div
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-popover/95 p-1.5 shadow-clay-lg ring-1 ring-primary/12 backdrop-blur-xl"
      >
        <span className="flex items-center gap-2 rounded-full bg-primary/12 py-1.5 pr-3 pl-2.5 text-primary">
          <Icon className="size-[1.05rem]" strokeWidth={2.2} />
          <span className="text-sm font-semibold">{tool.label}</span>
        </span>

        <motion.button
          type="button"
          onClick={onOpenLauncher}
          aria-label="Browse all tools"
          aria-keyshortcuts="Meta+K Control+K"
          whileTap={{ scale: 0.96 }}
          transition={springSnappy}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LayoutGrid className="size-[1.05rem]" strokeWidth={2.1} />
          <span className="hidden sm:inline">Tools</span>
          <kbd className="hidden rounded-md border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
            ⌘K
          </kbd>
          <ChevronDown className="size-3.5 sm:hidden" />
        </motion.button>

        <span className="mx-0.5 h-7 w-px shrink-0 bg-border" />

        {hoverable ? <Tip label="Results & downloads">{resultsBtn}</Tip> : resultsBtn}
      </motion.div>
    </div>
  );
}
