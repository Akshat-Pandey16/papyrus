import { ArrowDown, ArrowUp, FileText, FileUp, X } from "lucide-react";
import { type DragEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import type { PageRange } from "@/components/shared/page-range-builder";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/pdf-compress/format";
import { FilePagesPopover } from "@/features/pdf-merge/components/file-pages-popover";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

export type MergeFileSpec = {
  file: File;
  ranges: PageRange[] | null;
};

export type MultiFileDropzoneProps = {
  files: MergeFileSpec[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onClearAll: () => void;
  onRangesChange: (index: number, ranges: PageRange[] | null) => void;
  disabled?: boolean;
  className?: string;
};

export function MultiFileDropzone({
  files,
  onAdd,
  onRemove,
  onMove,
  onClearAll,
  onRangesChange,
  disabled = false,
  className,
}: MultiFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [isOver, setIsOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    if (file.type !== "application/pdf") return `${file.name}: only PDF files are supported.`;
    if (file.size > env.VITE_MAX_FILE_BYTES) {
      return `${file.name}: too large (max ${formatBytes(env.VITE_MAX_FILE_BYTES)}).`;
    }
    return null;
  };

  const handleFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid: File[] = [];
    for (const f of arr) {
      const err = validate(f);
      if (err) {
        setError(err);
        return;
      }
      valid.push(f);
    }
    setError(null);
    if (valid.length > 0) onAdd(valid);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <label htmlFor={inputId} className="sr-only">
        Choose PDF files to merge
      </label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-describedby={error ? `${inputId}-error` : undefined}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={onDrop}
        className={cn(
          "group relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card/40 p-8 text-center transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isOver
            ? "border-foreground/40 bg-foreground/5"
            : "border-border hover:border-foreground/20",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/5 text-foreground/80">
          <FileUp className="h-6 w-6" aria-hidden />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">
            {files.length === 0
              ? "Drop PDFs here, or click to browse"
              : "Add more PDFs, or drop them here"}
          </p>
          <p className="text-xs text-muted-foreground">
            Add at least 2 PDFs · Max {formatBytes(env.VITE_MAX_FILE_BYTES)} each · PDF only
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          disabled={disabled}
        >
          {files.length === 0 ? "Choose files" : "Add more files"}
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div role="alert" aria-live="polite" className="min-h-[1rem]">
        {error ? (
          <p id={`${inputId}-error`} className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {files.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {files.length} file{files.length === 1 ? "" : "s"} · merged in this order
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              disabled={disabled}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear all
            </Button>
          </div>
          <ol className="flex flex-col gap-1.5">
            {files.map((entry, index) => (
              <FileRow
                key={`${entry.file.name}-${index}-${entry.file.size}`}
                index={index}
                file={entry.file}
                ranges={entry.ranges}
                disabled={disabled}
                disableUp={index === 0}
                disableDown={index === files.length - 1}
                onMoveUp={() => onMove(index, index - 1)}
                onMoveDown={() => onMove(index, index + 1)}
                onRemove={() => onRemove(index)}
                onRangesChange={(next) => onRangesChange(index, next)}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

type FileRowProps = {
  index: number;
  file: File;
  ranges: PageRange[] | null;
  disabled: boolean;
  disableUp: boolean;
  disableDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onRangesChange: (next: PageRange[] | null) => void;
};

function FileRow({
  index,
  file,
  ranges,
  disabled,
  disableUp,
  disableDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onRangesChange,
}: FileRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-foreground/5 text-xs font-semibold text-foreground/80">
        {index + 1}
      </span>
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
      </div>
      <div className="shrink-0">
        <FilePagesPopover
          file={file}
          ranges={ranges}
          onChange={onRangesChange}
          disabled={disabled}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onMoveUp}
          disabled={disabled || disableUp}
          aria-label={`Move ${file.name} up`}
          className="h-8 w-8 p-0"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onMoveDown}
          disabled={disabled || disableDown}
          aria-label={`Move ${file.name} down`}
          className="h-8 w-8 p-0"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${file.name}`}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
