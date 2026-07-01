import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TOOL_CATEGORIES, TOOL_CATEGORY, TOOLS, toolsInCategory } from "@/features/studio/tools";
import type { ToolId } from "@/features/studio/types";
import { cn } from "@/lib/utils";

export function ToolLauncher({
  open,
  onOpenChange,
  activeTool,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOL_CATEGORIES.map((cat) => {
      const ids = toolsInCategory(cat.id).filter((id) => {
        if (!q) return true;
        const tool = TOOLS[id];
        return (
          tool.label.toLowerCase().includes(q) ||
          tool.tagline.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
        );
      });
      return { ...cat, ids };
    }).filter((g) => g.ids.length > 0);
  }, [query]);

  const flat = useMemo(() => groups.flatMap((g) => g.ids), [groups]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the highlighted row whenever the search query changes
  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  const choose = (id: ToolId) => {
    onSelect(id);
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const id = flat[cursor];
      if (id) choose(id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Choose a tool</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tools…"
            className="w-full bg-transparent text-[0.95rem] outline-none placeholder:text-muted-foreground/70"
          />
          <kbd className="hidden rounded-md border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No tools match “{query}”.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="mb-1">
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {group.label}
                </p>
                {group.ids.map((id) => {
                  const tool = TOOLS[id];
                  const Icon = tool.icon;
                  const idx = flat.indexOf(id);
                  const focused = idx === cursor;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => choose(id)}
                      onMouseMove={() => setCursor(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                        focused ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                          focused
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="size-[1.05rem]" strokeWidth={2.1} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {tool.label}
                          {id === activeTool ? (
                            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              Active
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {tool.tagline}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate · <kbd className="font-mono">↵</kbd> open
          </span>
          <span>{TOOL_CATEGORY[activeTool]}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
