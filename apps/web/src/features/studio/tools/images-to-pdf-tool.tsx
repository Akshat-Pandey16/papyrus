import { FileImage, GripVertical, ImagePlus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SortableList } from "@/components/shared/sortable-list";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import type { UploadContentType } from "@/features/pdf-compress/api";
import { formatBytes } from "@/features/pdf-compress/format";
import { useUploadStore } from "@/features/pdf-compress/store";
import {
  useConfirmUploadMutation,
  useCreateImagesToPdfJobMutation,
  useInitiateUploadMutation,
} from "@/features/pdf-tools/api";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { useStudioStore } from "@/features/studio/store";
import { StudioLayout } from "@/features/studio/studio-layout";
import { validateImage } from "@/features/studio/validate";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { randomUUID } from "@/lib/uuid";

type PageSize = "auto" | "a4" | "letter";

export function ImagesToPdfTool({ onLaunched }: { onLaunched: () => void }) {
  const files = useStudioStore((s) => s.files);
  const addFiles = useStudioStore((s) => s.addFiles);
  const removeFile = useStudioStore((s) => s.removeFile);
  const reorderFiles = useStudioStore((s) => s.reorderFiles);
  const clearFiles = useStudioStore((s) => s.clearFiles);
  const startUpload = useUploadStore((s) => s.start);
  const updateUpload = useUploadStore((s) => s.update);

  const [pageSize, setPageSize] = useState<PageSize>("auto");
  const [submitting, setSubmitting] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addInputId = useId();

  const initiate = useInitiateUploadMutation();
  const confirm = useConfirmUploadMutation();
  const create = useCreateImagesToPdfJobMutation();

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const canSubmit = files.length >= 1 && !submitting;

  const onAddInput = (list: FileList | null) => {
    if (!list) return;
    const valid: { id: string; file: File }[] = [];
    for (const f of Array.from(list)) {
      const err = validateImage(f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        continue;
      }
      valid.push({ id: randomUUID(), file: f });
    }
    if (valid.length > 0) addFiles(valid);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const init = await initiate.mutateAsync({
      name: file.name,
      contentType: file.type as UploadContentType,
      sizeBytes: file.size,
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(init.upload.fields)) form.append(k, v);
    form.append("file", file);
    const res = await fetch(init.upload.url, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`);
    await confirm.mutateAsync({ documentId: init.documentId });
    return init.documentId;
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const clientUploadId = randomUUID();
    const idempotencyKey = randomUUID();
    startUpload({
      clientUploadId,
      kind: "images_to_pdf",
      fileName: files.length === 1 && files[0] ? files[0].file.name : `${files.length} images`,
      fileSize: totalSize,
      fileType: "application/pdf",
      level: "medium",
      idempotencyKey,
      phase: "uploading",
      bytesUploaded: 0,
      bytesTotal: totalSize,
      createdAt: Date.now(),
    });
    try {
      await ensureAnonymousSession();
      let uploaded = 0;
      const documentIds = await Promise.all(
        files.map(async (entry) => {
          const id = await uploadImage(entry.file);
          uploaded += entry.file.size;
          updateUpload(clientUploadId, { bytesUploaded: uploaded });
          return id;
        }),
      );
      const job = await create.mutateAsync({ documentIds, pageSize, idempotencyKey });
      updateUpload(clientUploadId, { jobId: job.id, phase: "queued" });
      clearFiles();
      onLaunched();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      const code = err instanceof ApiError ? err.code : "upload_failed";
      updateUpload(clientUploadId, { phase: "failed", errorCode: code, errorMessage: message });
      toast.error(message);
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
                {files.length} image{files.length === 1 ? "" : "s"}
              </span>{" "}
              · drag to set the page order.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addInputRef.current?.click()}
              disabled={submitting}
            >
              <ImagePlus />
              Add
            </Button>
            <input
              ref={addInputRef}
              id={addInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
                  <FileImage className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={entry.file.name}>
                      {entry.file.name}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatBytes(entry.file.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeFile(id)}
                    aria-label="Remove image"
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
            <ImagePlus className="size-4" />
            Add more images
          </button>
        </div>
      }
      inspector={
        <InspectorFrame
          toolId="images_to_pdf"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {submitting ? <Spinner /> : <ImagePlus />}
              {submitting
                ? "Starting…"
                : files.length === 0
                  ? "Add an image"
                  : `Combine ${files.length} image${files.length === 1 ? "" : "s"}`}
            </Button>
          }
        >
          <InspectorSection label="Page size">
            <Segmented
              value={pageSize}
              onChange={setPageSize}
              options={[
                { value: "auto", label: "Fit image" },
                { value: "a4", label: "A4" },
                { value: "letter", label: "Letter" },
              ]}
            />
          </InspectorSection>
          <InspectorSection label="Summary">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              {files.length} image{files.length === 1 ? "" : "s"} ·{" "}
              <span className="font-mono">{formatBytes(totalSize)}</span>
            </div>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
