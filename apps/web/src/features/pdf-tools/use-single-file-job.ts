import { useCallback, useState } from "react";
import { toast } from "sonner";
import { usePdfUpload } from "@/features/pdf-compress/hooks/use-pdf-upload";
import { type UploadKind, useUploadStore } from "@/features/pdf-compress/store";
import type { CompressionLevel } from "@/features/pdf-compress/types";
import { ApiError } from "@/lib/api/client";
import { mapErrorMessage } from "@/lib/api/error-message";
import { randomUUID } from "@/lib/uuid";

export type RunArgs = {
  file: File;
  kind: UploadKind;
  level?: CompressionLevel;
  createJob: (documentId: string, idempotencyKey: string) => Promise<{ id: string }>;
};

export function useSingleFileJobRunner() {
  const [submitting, setSubmitting] = useState(false);
  const startUpload = useUploadStore((s) => s.start);
  const updateUpload = useUploadStore((s) => s.update);
  const { start: doUpload, cancel } = usePdfUpload();

  const run = useCallback(
    async ({ file, kind, level = "medium", createJob }: RunArgs) => {
      if (submitting) return null;
      setSubmitting(true);
      const clientUploadId = randomUUID();
      const idempotencyKey = randomUUID();
      startUpload({
        clientUploadId,
        kind,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        level,
        idempotencyKey,
        phase: "preparing",
        bytesUploaded: 0,
        bytesTotal: file.size,
        createdAt: Date.now(),
      });
      try {
        const result = await doUpload({ clientUploadId, file });
        updateUpload(clientUploadId, { documentId: result.documentId });
        const job = await createJob(result.documentId, idempotencyKey);
        updateUpload(clientUploadId, { jobId: job.id, phase: "queued" });
        return { clientUploadId, jobId: job.id };
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
        if (code !== "cancelled") toast.error(mapErrorMessage(code, message));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, doUpload, cancel, startUpload, updateUpload],
  );

  return { run, submitting };
}
