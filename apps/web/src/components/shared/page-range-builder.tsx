import { Plus, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

export type PageRange = { from: number; to: number };

export type PageRangeBuilderProps = {
  pageCount: number | null;
  ranges: PageRange[];
  onChange: (next: PageRange[]) => void;
  maxRanges?: number;
  disabled?: boolean | undefined;
  className?: string;
  compact?: boolean;
};

const DEFAULT_MAX_RANGES = 50;

export function PageRangeBuilder({
  pageCount,
  ranges,
  onChange,
  maxRanges = DEFAULT_MAX_RANGES,
  disabled = false,
  className,
  compact = false,
}: PageRangeBuilderProps) {
  const max = pageCount ?? 1;
  const canAdd = ranges.length < maxRanges;
  const isReady = pageCount != null && pageCount >= 1;

  const totalPages = useMemo(
    () => ranges.reduce((sum, r) => sum + Math.max(0, r.to - r.from + 1), 0),
    [ranges],
  );

  const updateRange = useCallback(
    (index: number, patch: Partial<PageRange>) => {
      const next = ranges.map((r, i) => {
        if (i !== index) return r;
        let from = patch.from ?? r.from;
        let to = patch.to ?? r.to;
        from = Math.min(Math.max(1, from), max);
        to = Math.min(Math.max(1, to), max);
        if (to < from) {
          if (patch.from !== undefined) to = from;
          else from = to;
        }
        return { from, to };
      });
      onChange(next);
    },
    [ranges, onChange, max],
  );

  const addRange = useCallback(() => {
    if (!canAdd || !isReady) return;
    const last = ranges[ranges.length - 1];
    const start = last ? Math.min(last.to + 1, max) : 1;
    onChange([...ranges, { from: start, to: Math.min(start, max) }]);
  }, [canAdd, isReady, ranges, onChange, max]);

  const removeRange = useCallback(
    (index: number) => {
      if (ranges.length <= 1) {
        onChange([{ from: 1, to: Math.min(1, max) }]);
        return;
      }
      onChange(ranges.filter((_, i) => i !== index));
    },
    [ranges, onChange, max],
  );

  if (!isReady) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        Pick a file first to choose ranges.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ol className="flex flex-col gap-2">
        {ranges.map((range, index) => (
          <li
            key={index.toString()}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border bg-background",
              compact ? "p-1.5" : "p-2.5",
            )}
          >
            {!compact ? (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-foreground/5 text-[10px] font-semibold text-foreground/80">
                {index + 1}
              </span>
            ) : null}
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">From</span>
              <NumberInput
                value={range.from}
                onChange={(v) => updateRange(index, { from: v })}
                min={1}
                max={max}
                disabled={disabled}
                ariaLabel={`Range ${index + 1} from page`}
              />
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <NumberInput
                value={range.to}
                onChange={(v) => updateRange(index, { to: v })}
                min={1}
                max={max}
                disabled={disabled}
                ariaLabel={`Range ${index + 1} to page`}
              />
              <span className="text-[10px] text-muted-foreground">
                ({Math.max(0, range.to - range.from + 1)} pages)
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRange(index)}
              disabled={disabled || ranges.length === 1}
              aria-label={`Remove range ${index + 1}`}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRange}
          disabled={disabled || !canAdd}
          className="h-8"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Add range
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {totalPages} page{totalPages === 1 ? "" : "s"} of {pageCount} selected
        </span>
      </div>
    </div>
  );
}

export function formatRangesShort(ranges: PageRange[]): string {
  if (ranges.length === 0) return "—";
  return ranges.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`)).join(", ");
}
