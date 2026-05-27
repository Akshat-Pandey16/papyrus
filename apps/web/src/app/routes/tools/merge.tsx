import { createFileRoute } from "@tanstack/react-router";
import { Files, Layers } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ToolOptionsHeader, ToolPageShell } from "@/components/layout/tool-page-shell";
import type { PageRange } from "@/components/shared/page-range-builder";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { type CreateMergeJobInput, useCreateMergeJobMutation } from "@/features/pdf-merge/api";
import { MergeCard } from "@/features/pdf-merge/components/merge-card";
import { MergeOptionsPanel } from "@/features/pdf-merge/components/merge-options-panel";
import {
  type MergeFileSpec,
  MultiFileDropzone,
} from "@/features/pdf-merge/components/multi-file-dropzone";
import { useMergeUpload } from "@/features/pdf-merge/hooks/use-merge-upload";
import { useRecoverMerges } from "@/features/pdf-merge/hooks/use-recover-merges";
import { DEFAULT_MERGE_OPTIONS } from "@/features/pdf-merge/presets";
import { type MergeFileEntry, useMergeStore } from "@/features/pdf-merge/store";
import type { MergeInput, MergeOptions } from "@/features/pdf-merge/types";
import { ApiError } from "@/lib/api/client";
import { randomUUID } from "@/lib/uuid";

export const Route = createFileRoute("/tools/merge")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: MergePage,
});

function newId(): string {
  return randomUUID();
}

function rangesToSpec(ranges: PageRange[] | null): string | null {
  if (ranges == null || ranges.length === 0) return null;
  return ranges.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`)).join(",");
}

function MergePage() {
  useRecoverMerges();

  const [pendingFiles, setPendingFiles] = useState<MergeFileSpec[]>([]);
  const [options, setOptions] = useState<MergeOptions>(DEFAULT_MERGE_OPTIONS);
  const [submitting, setSubmitting] = useState(false);
  const startBatch = useMergeStore((s) => s.start);
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const removeBatch = useMergeStore((s) => s.remove);
  const batchesMap = useMergeStore((s) => s.batches);
  const { start, cancel } = useMergeUpload();
  const createJob = useCreateMergeJobMutation();

  const onAdd = useCallback((incoming: File[]) => {
    setPendingFiles((prev) => [
      ...prev,
      ...incoming.map((file) => ({ id: newId(), file, ranges: null })),
    ]);
  }, []);

  const onRemove = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onMove = useCallback((from: number, to: number) => {
    setPendingFiles((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const onRangesChange = useCallback((index: number, ranges: PageRange[] | null) => {
    setPendingFiles((prev) => prev.map((entry, i) => (i === index ? { ...entry, ranges } : entry)));
  }, []);

  const onClearAll = useCallback(() => setPendingFiles([]), []);

  const onSubmit = useCallback(async () => {
    if (pendingFiles.length < 2 || submitting) return;
    setSubmitting(true);

    const clientBatchId = newId();
    const idempotencyKey = newId();
    const fileEntries: MergeFileEntry[] = pendingFiles.map((entry) => ({
      clientFileId: newId(),
      fileName: entry.file.name,
      fileSize: entry.file.size,
      fileType: entry.file.type,
      pageRanges: rangesToSpec(entry.ranges),
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

    const uploadInputs = fileEntries.map((entry, idx) => ({
      clientFileId: entry.clientFileId,
      file: pendingFiles[idx]?.file as File,
    }));

    try {
      const { documentIds } = await start({ clientBatchId, files: uploadInputs });

      const inputs: MergeInput[] = documentIds.map((documentId, idx) => ({
        documentId,
        pageRanges: fileEntries[idx]?.pageRanges ?? null,
      }));

      const input: CreateMergeJobInput = {
        inputs,
        idempotencyKey,
        options,
      };
      const job = await createJob.mutateAsync(input);
      updateBatch(clientBatchId, { jobId: job.id, phase: "queued" });
      setPendingFiles([]);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
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
      if (code !== "cancelled") {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [pendingFiles, submitting, options, startBatch, start, updateBatch, createJob, cancel]);

  const onRetry = useCallback(
    (id: string) => {
      removeBatch(id);
    },
    [removeBatch],
  );

  const sortedIds = useMemo(() => {
    return Object.values(batchesMap)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((batch) => batch.clientBatchId);
  }, [batchesMap]);

  const canSubmit = pendingFiles.length >= 2 && !submitting;
  const totalSize = pendingFiles.reduce((s, entry) => s + entry.file.size, 0);

  return (
    <ToolPageShell
      tag="Merge"
      title="Merge PDFs"
      description="Drop two or more PDFs, drag to reorder, optionally pick pages per file — get one tidy file."
      icon={Layers}
      workspace={
        <MultiFileDropzone
          files={pendingFiles}
          onAdd={onAdd}
          onRemove={onRemove}
          onMove={onMove}
          onClearAll={onClearAll}
          onRangesChange={onRangesChange}
          disabled={submitting}
        />
      }
      options={
        <>
          <ToolOptionsHeader title="Summary" hint="Files merge in the order shown." />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <SummaryRow label="Files">{pendingFiles.length}</SummaryRow>
            <SummaryRow label="Total size">{formatBytesShort(totalSize)}</SummaryRow>
          </dl>
          <MergeOptionsPanel value={options} onChange={setOptions} disabled={submitting} />
          <Button size="lg" onClick={onSubmit} disabled={!canSubmit} className="h-11">
            <Files className="mr-2 h-4 w-4" aria-hidden />
            {submitting
              ? "Starting…"
              : pendingFiles.length < 2
                ? "Add at least 2 PDFs"
                : `Merge ${pendingFiles.length} PDFs`}
          </Button>
        </>
      }
      active={
        sortedIds.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedIds.map((id) => (
              <MergeCard key={id} clientBatchId={id} onRetry={onRetry} />
            ))}
          </div>
        ) : null
      }
    />
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-background p-3">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-base font-semibold">{children}</dd>
    </div>
  );
}

function formatBytesShort(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
