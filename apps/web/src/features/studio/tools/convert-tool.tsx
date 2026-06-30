import { FileType2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/features/pdf-compress/format";
import { useCreateConvertJobMutation } from "@/features/pdf-tools/api";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import type { SingleToolProps } from "@/features/studio/types";
import { officeContentType, validateOffice } from "@/features/studio/validate";

export function ConvertTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const create = useCreateConvertJobMutation();
  const { run, submitting } = useSingleFileJobRunner();
  const inputRef = useRef<HTMLInputElement>(null);

  const onRun = async () => {
    const contentType = officeContentType(file) ?? undefined;
    const result = await run({
      file,
      kind: "convert",
      ...(contentType ? { contentType } : {}),
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, idempotencyKey });
        return { id: job.id };
      },
    });
    if (result) onLaunched();
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 pt-6">
      <div className="flex w-full flex-col items-center gap-5 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-clay-sm">
        <span className="grid size-16 place-items-center rounded-2xl bg-molten text-primary-foreground shadow-ember">
          <FileType2 className="size-8" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Convert to PDF</h2>
          <p className="text-sm text-muted-foreground">
            Word, Excel, PowerPoint, and OpenDocument files become a clean, shareable PDF.
          </p>
        </div>
        <div className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 p-4 text-left">
          <FileType2 className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{file.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => inputRef.current?.click()}
            aria-label="Replace file"
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove file">
            <Trash2 className="size-4" />
          </Button>
        </div>
        <Button variant="molten" size="lg" onClick={onRun} disabled={submitting} className="w-full">
          {submitting ? <Spinner /> : <Sparkles />}
          {submitting ? "Starting…" : "Convert to PDF"}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp"
        className="sr-only"
        onChange={(e) => {
          const next = e.target.files?.[0];
          e.target.value = "";
          if (!next) return;
          const err = validateOffice(next);
          if (err) return;
          onReplaceFile(next);
        }}
      />
    </div>
  );
}
