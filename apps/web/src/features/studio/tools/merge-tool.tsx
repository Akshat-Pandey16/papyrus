import { FilePlus2, FileText, GripVertical, Layers, ListFilter, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SortableList } from "@/components/shared/sortable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { formatBytes } from "@/features/pdf-compress/format";
import { useCreateMergeJobMutation } from "@/features/pdf-merge/api";
import { useMergeUpload } from "@/features/pdf-merge/hooks/use-merge-upload";
import { DEFAULT_MERGE_OPTIONS, isValidPageRangeSpec } from "@/features/pdf-merge/presets";
import { type MergeFileEntry, useMergeStore } from "@/features/pdf-merge/store";
import type { MergeInput, MergeOptions } from "@/features/pdf-merge/types";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { useStudioStore } from "@/features/studio/store";
import { StudioLayout } from "@/features/studio/studio-layout";
import { validatePdf } from "@/features/studio/validate";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { randomUUID } from "@/lib/uuid";

export function MergeTool({ onLaunched }: { onLaunched: () => void }) {
  const files = useStudioStore((s) => s.files);
  const addFiles = useStudioStore((s) => s.addFiles);
  const removeFile = useStudioStore((s) => s.removeFile);
  const reorderFiles = useStudioStore((s) => s.reorderFiles);
  const clearFiles = useStudioStore((s) => s.clearFiles);

  const [ranges, setRanges] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<MergeOptions>(DEFAULT_MERGE_OPTIONS);
  const [submitting, setSubmitting] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addInputId = useId();

  const { start, cancel } = useMergeUpload();
  const startBatch = useMergeStore((s) => s.start);
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const createJob = useCreateMergeJobMutation();

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const canSubmit = files.length >= 2 && !submitting;

  const onAddInput = (list: FileList | null) => {
    if (!list) return;
    const valid: { id: string; file: File }[] = [];
    for (const f of Array.from(list)) {
      const err = validatePdf(f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        continue;
      }
      valid.push({ id: randomUUID(), file: f });
    }
    if (valid.length > 0) addFiles(valid);
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const clientBatchId = randomUUID();
    const idempotencyKey = randomUUID();
    const fileEntries: MergeFileEntry[] = files.map((entry) => ({
      clientFileId: entry.id,
      fileName: entry.file.name,
      fileSize: entry.file.size,
      fileType: entry.file.type,
      pageRanges: ranges[entry.id]?.trim() || null,
      phase: "pending",
      bytesUploaded: 0,
      bytesTotal: entry.file.size,
    }));

    startBatch({
      clientBatchId,
      idempotencyKey,
      files: fileEntries,
      phase: "uploading",
      createdAt: Date.now(),
    });

    try {
      const uploadInputs = files.map((entry) => ({ clientFileId: entry.id, file: entry.file }));
      const { documentIds } = await start({ clientBatchId, files: uploadInputs });
      const inputs: MergeInput[] = documentIds.map((documentId, idx) => ({
        documentId,
        pageRanges: fileEntries[idx]?.pageRanges ?? null,
      }));
      const job = await createJob.mutateAsync({ inputs, idempotencyKey, options });
      updateBatch(clientBatchId, { jobId: job.id, phase: "queued" });
      clearFiles();
      setRanges({});
      onLaunched();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      const code =
        err instanceof ApiError
          ? err.code
          : err instanceof Error && err.message.includes("cancel")
            ? "cancelled"
            : "upload_failed";
      cancel(clientBatchId);
      updateBatch(clientBatchId, {
        phase: code === "cancelled" ? "cancelled" : "failed",
        errorCode: code,
        errorMessage: message,
      });
      if (code !== "cancelled") toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudioLayout
      canvas={
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>{" "}
              · drag to set the order they'll combine.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addInputRef.current?.click()}
              disabled={submitting}
            >
              <FilePlus2 />
              Add
            </Button>
            <input
              ref={addInputRef}
              id={addInputId}
              type="file"
              accept="application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                onAddInput(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <SortableList
            ids={files.map((f) => f.id)}
            onReorder={reorderFiles}
            disabled={submitting}
            className="flex flex-col gap-2"
            renderItem={(id, idx, handle) => {
              const entry = files[idx];
              if (!entry) return null;
              const spec = ranges[id]?.trim();
              return (
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-clay-sm",
                    handle.isDragging && "ring-2 ring-primary/40",
                  )}
                >
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    className="cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing"
                    {...handle.attributes}
                    {...handle.listeners}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 font-mono text-xs font-bold text-primary">
                    {idx + 1}
                  </span>
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={entry.file.name}>
                      {entry.file.name}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatBytes(entry.file.size)} · {spec ? `pages ${spec}` : "all pages"}
                    </p>
                  </div>
                  <RangePopover
                    value={ranges[id] ?? ""}
                    onChange={(v) => setRanges((r) => ({ ...r, [id]: v }))}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeFile(id)}
                    aria-label="Remove file"
                  >
                    <X />
                  </Button>
                </div>
              );
            }}
          />

          <button
            type="button"
            onClick={() => addInputRef.current?.click()}
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <FilePlus2 className="size-4" />
            Drop or add more PDFs
          </button>
        </div>
      }
      inspector={
        <InspectorFrame
          toolId="merge"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Layers />}
              {submitting
                ? "Starting…"
                : files.length < 2
                  ? "Add at least 2 PDFs"
                  : `Merge ${files.length} PDFs`}
            </Button>
          }
        >
          <InspectorSection label="Summary">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Files" value={String(files.length)} />
              <Stat label="Total size" value={formatBytes(totalSize)} />
            </div>
          </InspectorSection>

          <InspectorSection label="Options">
            <label
              htmlFor="merge-bookmarks"
              className="flex cursor-pointer items-center justify-between gap-3"
            >
              <span className="text-xs">
                <span className="font-medium">Bookmark each file</span>
                <span className="block text-[11px] text-muted-foreground">
                  Adds an outline entry per source PDF
                </span>
              </span>
              <Switch
                id="merge-bookmarks"
                checked={options.addFilenameBookmarks}
                onCheckedChange={(v) => setOptions((o) => ({ ...o, addFilenameBookmarks: v }))}
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Blank pages between</span>
              <NumberInput
                value={options.blankPagesBetween}
                onChange={(v) => setOptions((o) => ({ ...o, blankPagesBetween: v }))}
                min={0}
                max={2}
                ariaLabel="Blank pages between files"
              />
            </div>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border/60 bg-muted/30 p-3">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-display text-lg font-semibold">{value}</span>
    </div>
  );
}

function RangePopover({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const valid = isValidPageRangeSpec(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Choose pages">
          <ListFilter />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium">Pages to include</p>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 1-3, 5  ·  blank = all"
            aria-invalid={!valid}
          />
          <p className={cn("text-[11px]", valid ? "text-muted-foreground" : "text-destructive")}>
            {valid ? "Leave blank to include every page." : "Use formats like 1-3, 5, 8-10."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
