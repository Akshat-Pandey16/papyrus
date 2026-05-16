import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnonymousBanner } from "@/components/shared/anonymous-banner";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import {
  type CreateCompressionJobInput,
  useCreateCompressionJobMutation,
} from "@/features/pdf-compress/api";
import { CompressionCard } from "@/features/pdf-compress/components/compression-card";
import { CompressionLevelSelector } from "@/features/pdf-compress/components/compression-level-selector";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { JobHistoryList } from "@/features/pdf-compress/components/job-history-list";
import { usePdfUpload } from "@/features/pdf-compress/hooks/use-pdf-upload";
import { useRecoverUploads } from "@/features/pdf-compress/hooks/use-recover-uploads";
import { useUploadStore } from "@/features/pdf-compress/store";
import type { CompressionLevel } from "@/features/pdf-compress/types";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/tools/compress")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: CompressPage,
});

function newClientUploadId(): string {
  return crypto.randomUUID();
}

function CompressPage() {
  useRecoverUploads();

  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const startUpload = useUploadStore((s) => s.start);
  const updateUpload = useUploadStore((s) => s.update);
  const removeUpload = useUploadStore((s) => s.remove);
  const uploadsMap = useUploadStore((s) => s.uploads);
  const { start, cancel } = usePdfUpload();
  const createJob = useCreateCompressionJobMutation();

  const onSubmit = useCallback(async () => {
    if (!pendingFile || submitting) return;
    setSubmitting(true);
    const clientUploadId = newClientUploadId();
    const idempotencyKey = crypto.randomUUID();
    startUpload({
      clientUploadId,
      kind: "compress",
      fileName: pendingFile.name,
      fileSize: pendingFile.size,
      fileType: pendingFile.type,
      level,
      idempotencyKey,
      phase: "preparing",
      bytesUploaded: 0,
      bytesTotal: pendingFile.size,
      createdAt: Date.now(),
    });

    try {
      const result = await start({ clientUploadId, file: pendingFile });
      updateUpload(clientUploadId, { documentId: result.documentId });

      const input: CreateCompressionJobInput = {
        documentId: result.documentId,
        compressionLevel: level,
        idempotencyKey,
      };
      const job = await createJob.mutateAsync(input);
      updateUpload(clientUploadId, { jobId: job.id, phase: "queued" });
      setPendingFile(null);
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
      cancel(clientUploadId);
      updateUpload(clientUploadId, {
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
  }, [pendingFile, submitting, level, startUpload, start, updateUpload, createJob, cancel]);

  const onRetry = useCallback(
    (id: string) => {
      removeUpload(id);
    },
    [removeUpload],
  );

  const sortedIds = useMemo(() => {
    return Object.values(uploadsMap)
      .filter((entry) => entry.kind === "compress")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((entry) => entry.clientUploadId);
  }, [uploadsMap]);

  return (
    <div className="w-full px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <AnonymousBanner />
        <header className="flex flex-col gap-2">
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]">
            Drop a PDF, pick how aggressively to compress, and we&apos;ll save you 20–50% on file
            size. Files are deleted after 24 hours.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-5">
            <FileDropzone
              onFile={(f) => setPendingFile(f)}
              selectedFile={pendingFile}
              onClear={() => setPendingFile(null)}
              disabled={submitting}
            />
          </div>

          <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold">Options</h2>
              <p className="text-xs text-muted-foreground">
                Pick a balance between file size and visual fidelity.
              </p>
            </div>
            <CompressionLevelSelector value={level} onChange={setLevel} disabled={submitting} />
            <Button
              size="lg"
              onClick={onSubmit}
              disabled={!pendingFile || submitting}
              className="h-11"
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              {submitting ? "Starting…" : "Compress PDF"}
            </Button>
          </aside>
        </section>

        {sortedIds.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Active</h2>
            <div className="flex flex-col gap-3">
              {sortedIds.map((id) => (
                <CompressionCard key={id} clientUploadId={id} onRetry={onRetry} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Recent jobs</h2>
          <JobHistoryList />
        </section>
      </div>
    </div>
  );
}
