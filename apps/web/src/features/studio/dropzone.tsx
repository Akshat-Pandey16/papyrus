import { FolderOpen, ScrollText } from "lucide-react";
import { motion } from "motion/react";
import { type DragEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { maxFileLabel, validatePdf } from "@/features/studio/validate";
import { cn } from "@/lib/utils";

export type DropzoneProps = {
  onFiles: (files: File[]) => void;
  multi?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Dropzone({ onFiles, multi = false, disabled = false, className }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const inputId = useId();
  const [over, setOver] = useState(false);

  const accept = (list: FileList | null) => {
    if (!list || disabled) return;
    const valid: File[] = [];
    for (const f of Array.from(list)) {
      const err = validatePdf(f);
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
    accept(e.dataTransfer.files);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: interactive drop surface; a hidden file input handles selection
    <div
      role="button"
      tabIndex={0}
      aria-label={multi ? "Drop PDFs or browse" : "Drop a PDF or browse"}
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
        "group relative flex min-h-[58svh] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed p-6 text-center transition-colors sm:p-10",
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
        <motion.span
          className="grid size-20 place-items-center rounded-3xl bg-molten text-primary-foreground shadow-ember"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        >
          <ScrollText className="size-9" strokeWidth={2} />
        </motion.span>
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Drop a PDF{multi ? " or a few" : ""} to begin
          </h2>
          <p className="max-w-md text-sm text-muted-foreground sm:text-base">
            Or click anywhere to browse. Up to {maxFileLabel()} · processed privately · gone in 24h.
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
        accept="application/pdf"
        multiple={multi}
        className="sr-only"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
