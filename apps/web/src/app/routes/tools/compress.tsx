import { createFileRoute, redirect } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
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
  beforeLoad: ({ location }) => {
    if (!useAuthStore.getState().hasAccess) {
      throw redirect({
        to: "/login",
        search: { next: location.pathname } as never,
      });
    }
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
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((entry) => entry.clientUploadId);
  }, [uploadsMap]);

  return (
    <div className="w-full px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Tools / Compress
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Compress a PDF</h1>
          <p className="max-w-2xl text-[0.95rem] text-muted-foreground">
            Make PDFs smaller while keeping them readable. Pick a level, drop your file, and we
            handle the rest. Files stay private and are deleted after 24 hours.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-5">
            <FileDropzone
              onFile={(f) => setPendingFile(f)}
              selectedFile={pendingFile}
              onClear={() => setPendingFile(null)}
              disabled={submitting}
            />
            <CompressionLevelSelector value={level} onChange={setLevel} disabled={submitting} />
            <Button
              size="lg"
              onClick={onSubmit}
              disabled={!pendingFile || submitting}
              className="self-start"
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              {submitting ? "Starting…" : "Compress PDF"}
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
                <CompressionCard key={id} clientUploadId={id} onRetry={onRetry} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recent jobs
          </h2>
          <JobHistoryList />
        </section>
      </div>
    </div>
  );
}
