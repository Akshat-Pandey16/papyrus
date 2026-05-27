import { FileText, RefreshCw, X } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/pdf-compress/format";
import { PageCanvas } from "@/features/studio/page-canvas";
import { validatePdf } from "@/features/studio/validate";

export function CanvasHeader({
  file,
  pageCount,
  onReplaceFile,
  onRemove,
}: {
  file: File;
  pageCount: number | null;
  onReplaceFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-clay-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
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
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs leading-relaxed text-foreground/80">
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
    <div className="flex flex-col gap-4">
      <CanvasHeader
        file={file}
        pageCount={pageCount}
        onReplaceFile={onReplaceFile}
        onRemove={onRemove}
      />
      {instruction ? <CanvasInstruction>{instruction}</CanvasInstruction> : null}
      <PageCanvas
        file={file}
        maxPages={maxPages ?? 60}
        rotations={rotations}
        onPageClick={onPageClick}
        selectedPages={selectedPages}
        selectionOrder={selectionOrder}
        highlightedPages={highlightedPages}
      />
    </div>
  );
}
