import { FileText, RefreshCw, X } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/pdf-compress/format";
import { PageCanvas } from "@/features/studio/page-canvas";
import { validatePdf } from "@/features/studio/validate";
import { cn } from "@/lib/utils";

export function CanvasHeader({
  file,
  pageCount,
  onReplaceFile,
  onRemove,
  inline = false,
}: {
  file: File;
  pageCount: number | null;
  onReplaceFile: (file: File) => void;
  onRemove: () => void;
  inline?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        inline
          ? "border-b border-border/60 px-3 py-2.5 sm:px-4"
          : "rounded-2xl border border-border/70 bg-card p-2.5",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <FileText className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {formatBytes(file.size)}
          {pageCount != null ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => inputRef.current?.click()}
        className="shrink-0"
      >
        <RefreshCw />
        <span className="hidden sm:inline">Replace</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Remove file"
        className="shrink-0"
      >
        <X />
      </Button>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const err = validatePdf(f);
          if (err) {
            toast.error(err);
            return;
          }
          onReplaceFile(f);
        }}
      />
    </div>
  );
}

export function CanvasInstruction({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

export type StageCanvasProps = {
  file: File;
  pageCount: number | null;
  onReplaceFile: (file: File) => void;
  onRemove: () => void;
  instruction?: ReactNode | undefined;
  rotations?: Record<number, number> | undefined;
  onPageClick?: ((page: number) => void) | undefined;
  selectedPages?: ReadonlySet<number> | undefined;
  selectionOrder?: Map<number, number> | undefined;
  highlightedPages?: ReadonlySet<number> | undefined;
  maxPages?: number | undefined;
};

export function StageCanvas({
  file,
  pageCount,
  onReplaceFile,
  onRemove,
  instruction,
  rotations,
  onPageClick,
  selectedPages,
  selectionOrder,
  highlightedPages,
  maxPages,
}: StageCanvasProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-canvas">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.035]" />
      <div className="relative">
        <CanvasHeader
          inline
          file={file}
          pageCount={pageCount}
          onReplaceFile={onReplaceFile}
          onRemove={onRemove}
        />
        {instruction ? (
          <p className="px-4 pt-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
            {instruction}
          </p>
        ) : null}
        <div className="p-3 sm:p-4">
          <PageCanvas
            file={file}
            maxPages={maxPages}
            rotations={rotations}
            onPageClick={onPageClick}
            selectedPages={selectedPages}
            selectionOrder={selectionOrder}
            highlightedPages={highlightedPages}
            className="relative"
          />
        </div>
      </div>
    </div>
  );
}
