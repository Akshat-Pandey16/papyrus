import { FileText, FileUp, X } from "lucide-react";
import { type DragEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/pdf-compress/format";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

export type FileDropzoneProps = {
  onFile: (file: File) => void;
  selectedFile?: File | null;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
};

export function FileDropzone({
  onFile,
  selectedFile = null,
  onClear,
  disabled = false,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [isOver, setIsOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    if (file.type !== "application/pdf") return "Only PDF files are supported.";
    if (file.size > env.VITE_MAX_FILE_BYTES) {
      return `File is too large. Max ${formatBytes(env.VITE_MAX_FILE_BYTES)}.`;
    }
    return null;
  };

  const handleFile = (file: File) => {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={inputId} className="sr-only">
        Choose a PDF file
      </label>
      <div
        aria-describedby={error ? `${inputId}-error` : undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={onDrop}
        className={cn(
          "group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card/40 p-8 text-center transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selectedFile
            ? "border-foreground/40 bg-foreground/5"
            : isOver
              ? "border-foreground/40 bg-foreground/5"
              : "border-border hover:border-foreground/20",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        {selectedFile ? (
          <>
            <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/10 text-foreground">
              <FileText className="h-6 w-6" aria-hidden />
            </div>
            <div className="flex max-w-full flex-col gap-1">
              <p className="max-w-full truncate text-base font-semibold">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(selectedFile.size)} · ready to compress
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
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
                Choose another file
              </Button>
              {onClear ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                  disabled={disabled}
                  aria-label="Remove selected file"
                >
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Remove
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/5 text-foreground/80">
              <FileUp className="h-6 w-6" aria-hidden />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold">Drop a PDF here, or click to browse</p>
              <p className="text-xs text-muted-foreground">
                Max file size {formatBytes(env.VITE_MAX_FILE_BYTES)} · PDF only
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
              Choose a file
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
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
    </div>
  );
}
