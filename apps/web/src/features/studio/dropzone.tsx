import { FolderOpen, ScrollText } from "lucide-react";
import { motion } from "motion/react";
import { type DragEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { maxFileLabel, validateFor } from "@/features/studio/validate";
import { cn } from "@/lib/utils";

export type DropzoneProps = {
  onFiles: (files: File[]) => void;
  multi?: boolean;
  accept?: "pdf" | "image" | "office";
  disabled?: boolean;
  variant?: "full" | "panel";
  showHeading?: boolean;
  className?: string;
};

const ACCEPT_ATTR = {
  pdf: "application/pdf",
  image: "image/jpeg,image/png,image/webp",
  office: ".doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp",
};

export function Dropzone({
  onFiles,
  multi = false,
  accept = "pdf",
  disabled = false,
  variant = "full",
  showHeading = true,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const inputId = useId();
  const [over, setOver] = useState(false);
  const isPanel = variant === "panel";
  const nouns = accept === "image" ? "images" : accept === "office" ? "documents" : "PDFs";
  const aNoun = accept === "image" ? "an image" : accept === "office" ? "a document" : "a PDF";

  const acceptFiles = (list: FileList | null) => {
    if (!list || disabled) return;
    const valid: File[] = [];
    for (const f of Array.from(list)) {
      const err = validateFor(accept, f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;
    onFiles(multi ? valid : valid.slice(0, 1));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setOver(false);
    acceptFiles(e.dataTransfer.files);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: interactive drop surface; a hidden file input handles selection
    <div
      role="button"
      tabIndex={0}
      aria-label={multi ? `Drop ${nouns} or browse` : `Drop ${aNoun} or browse`}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        if (!disabled) setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setOver(false);
      }}
      onDrop={onDrop}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed text-center transition-colors",
        isPanel ? "h-full min-h-[22rem] p-6 sm:p-8" : "min-h-[44svh] p-6 sm:p-10",
        over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.05]" />
      <motion.div
        animate={{ scale: over ? 1.05 : 1, rotate: over ? -1.5 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative z-0 flex flex-col items-center gap-5"
      >
        <span
          className={cn(
            "grid place-items-center rounded-3xl bg-molten text-primary-foreground shadow-ember",
            isPanel ? "size-16" : "size-20",
          )}
        >
          <ScrollText className={isPanel ? "size-7" : "size-9"} strokeWidth={2} />
        </span>
        <div className="flex flex-col gap-2">
          {showHeading ? (
            <h2
              className={cn(
                "font-display font-semibold tracking-tight text-balance",
                isPanel ? "text-2xl" : "text-3xl sm:text-4xl",
              )}
            >
              Drop {multi ? nouns : aNoun} {isPanel ? "here" : "to begin"}
            </h2>
          ) : null}
          <p className="max-w-md text-sm text-muted-foreground sm:text-base">
            {isPanel ? (
              <>or click to browse · up to {maxFileLabel()}</>
            ) : (
              <>
                Or click anywhere to browse. Up to {maxFileLabel()} · processed privately · gone in
                24h.
              </>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="molten"
          size="lg"
          tabIndex={-1}
          className="pointer-events-none mt-1"
        >
          <FolderOpen />
          Choose {multi ? "files" : "a file"}
        </Button>
      </motion.div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR[accept]}
        multiple={multi}
        className="sr-only"
        onChange={(e) => {
          acceptFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
