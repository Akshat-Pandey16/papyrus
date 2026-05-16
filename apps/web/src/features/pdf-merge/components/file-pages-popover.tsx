import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  formatRangesShort,
  type PageRange,
  PageRangeBuilder,
} from "@/components/shared/page-range-builder";
import { Button } from "@/components/ui/button";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { cn } from "@/lib/utils";

export type FilePagesPopoverProps = {
  file: File;
  ranges: PageRange[] | null;
  onChange: (next: PageRange[] | null) => void;
  disabled?: boolean | undefined;
};

export function FilePagesPopover({
  file,
  ranges,
  onChange,
  disabled = false,
}: FilePagesPopoverProps) {
  const { pageCount, loading } = useFilePageCount(file);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();
  const customMode = ranges !== null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary = customMode
    ? `${formatRangesShort(ranges ?? [])}${pageCount != null ? ` of ${pageCount}` : ""}`
    : pageCount != null
      ? `All ${pageCount} pages`
      : "All pages";

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || loading}
        className="h-8 gap-1.5"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId}
      >
        <span id={labelId} className="text-[11px] font-medium">
          Pages: <span className="text-foreground">{loading ? "…" : summary}</span>
        </span>
        <ChevronDown
          className={cn("h-3 w-3 text-muted-foreground", open && "rotate-180")}
          aria-hidden
        />
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose pages"
          className="absolute right-0 z-20 mt-1 flex w-[320px] flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-lg"
        >
          <ModeToggle
            customMode={customMode}
            onSet={(custom) => {
              if (custom) {
                if (pageCount != null) {
                  onChange([{ from: 1, to: pageCount }]);
                } else {
                  onChange([{ from: 1, to: 1 }]);
                }
              } else {
                onChange(null);
              }
            }}
            disabled={disabled}
          />
          {customMode ? (
            <PageRangeBuilder
              pageCount={pageCount}
              ranges={ranges ?? []}
              onChange={onChange}
              disabled={disabled}
              compact
            />
          ) : null}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setOpen(false)} className="h-8">
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModeToggle({
  customMode,
  onSet,
  disabled,
}: {
  customMode: boolean;
  onSet: (custom: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-foreground/5 p-1">
      <button
        type="button"
        onClick={() => onSet(false)}
        disabled={disabled}
        aria-pressed={!customMode}
        className={cn(
          "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          !customMode
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        All pages
      </button>
      <button
        type="button"
        onClick={() => onSet(true)}
        disabled={disabled}
        aria-pressed={customMode}
        className={cn(
          "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          customMode
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Custom
      </button>
    </div>
  );
}
