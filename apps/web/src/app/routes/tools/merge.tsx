import { createFileRoute, redirect } from "@tanstack/react-router";
import { Files } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
import { type CreateMergeJobInput, useCreateMergeJobMutation } from "@/features/pdf-merge/api";
import { MergeCard } from "@/features/pdf-merge/components/merge-card";
import { MergeHistoryList } from "@/features/pdf-merge/components/merge-history-list";
import { MultiFileDropzone } from "@/features/pdf-merge/components/multi-file-dropzone";
import { useMergeUpload } from "@/features/pdf-merge/hooks/use-merge-upload";
import { useRecoverMerges } from "@/features/pdf-merge/hooks/use-recover-merges";
import { type MergeFileEntry, useMergeStore } from "@/features/pdf-merge/store";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/tools/merge")({
  beforeLoad: ({ location }) => {
    if (!useAuthStore.getState().hasAccess) {
      throw redirect({
        to: "/login",
        search: { next: location.pathname } as never,
      });
    }
  },
  component: MergePage,
});

function newId(): string {
  return crypto.randomUUID();
}

function MergePage() {
  useRecoverMerges();

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const startBatch = useMergeStore((s) => s.start);
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const removeBatch = useMergeStore((s) => s.remove);
  const batchesMap = useMergeStore((s) => s.batches);
  const { start, cancel } = useMergeUpload();
  const createJob = useCreateMergeJobMutation();

  const onAdd = useCallback((incoming: File[]) => {
    setPendingFiles((prev) => [...prev, ...incoming]);
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

  const onClearAll = useCallback(() => setPendingFiles([]), []);

  const onSubmit = useCallback(async () => {
    if (pendingFiles.length < 2 || submitting) return;
    setSubmitting(true);

    const clientBatchId = newId();
    const idempotencyKey = newId();
    const fileEntries: MergeFileEntry[] = pendingFiles.map((f) => ({
      clientFileId: newId(),
      fileName: f.name,
      fileSize: f.size,
      fileType: f.type,
      phase: "pending",
      bytesUploaded: 0,
      bytesTotal: f.size,
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
      file: pendingFiles[idx] as File,
    }));

    try {
      const { documentIds } = await start({ clientBatchId, files: uploadInputs });

      const input: CreateMergeJobInput = {
        documentIds,
        idempotencyKey,
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
  }, [pendingFiles, submitting, startBatch, start, updateBatch, createJob, cancel]);

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

  return (
    <div className="w-full px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Tools / Merge
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Merge PDFs</h1>
          <p className="max-w-2xl text-[0.95rem] text-muted-foreground">
            Combine multiple PDFs into a single file. Drop your files, arrange the order, and we'll
            stitch them together. Files stay private and are deleted after 24 hours.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-5">
            <MultiFileDropzone
              files={pendingFiles}
              onAdd={onAdd}
              onRemove={onRemove}
              onMove={onMove}
              onClearAll={onClearAll}
              disabled={submitting}
            />
            <Button size="lg" onClick={onSubmit} disabled={!canSubmit} className="self-start">
              <Files className="mr-2 h-4 w-4" aria-hidden />
              {submitting
                ? "Starting…"
                : pendingFiles.length < 2
                  ? "Add at least 2 PDFs"
                  : `Merge ${pendingFiles.length} PDFs`}
            </Button>
          </div>
        </section>

        {sortedIds.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Active
            </h2>
            <div className="flex flex-col gap-3">
              {sortedIds.map((id) => (
                <MergeCard key={id} clientBatchId={id} onRetry={onRetry} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recent jobs
          </h2>
          <MergeHistoryList />
        </section>
      </div>
    </div>
  );
}
