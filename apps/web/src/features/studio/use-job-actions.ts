import { useState } from "react";
import { toast } from "sonner";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useMergeStore } from "@/features/pdf-merge/store";
import {
  useCancelJobMutation,
  useDownloadUrlMutation,
  useRetryJobMutation,
} from "@/features/pdf-tools/api";
import { triggerDownload } from "@/features/pdf-tools/download";
import type { SessionJob } from "@/features/studio/session-jobs";
import { ApiError } from "@/lib/api/client";
import { mapErrorMessage } from "@/lib/api/error-message";
import { randomUUID } from "@/lib/uuid";

export function useJobActions(job: SessionJob) {
  const removeUpload = useUploadStore((s) => s.remove);
  const updateUpload = useUploadStore((s) => s.update);
  const removeBatch = useMergeStore((s) => s.remove);
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const download = useDownloadUrlMutation();
  const cancel = useCancelJobMutation();
  const retry = useRetryJobMutation();
  const [expired, setExpired] = useState(false);

  const dismiss = () => (job.source === "upload" ? removeUpload(job.key) : removeBatch(job.key));

  const onDownload = async () => {
    if (!job.jobId) return;
    try {
      const r = await download.mutateAsync({ jobId: job.jobId });
      triggerDownload(r.url, r.filename);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 410 || err.code === "job_output_expired")) {
        setExpired(true);
        toast.info("This file was erased from our servers. Re-run the tool to regenerate it.");
      } else {
        toast.error("Could not prepare the download. Please try again.");
      }
    }
  };

  const onCancel = async () => {
    if (job.jobId) {
      try {
        await cancel.mutateAsync({ jobId: job.jobId });
      } catch {}
    }
    if (job.source === "upload") updateUpload(job.key, { phase: "cancelled" });
    else updateBatch(job.key, { phase: "cancelled" });
  };

  const onRetry = async () => {
    if (!job.jobId || retry.isPending) return;
    try {
      const next = await retry.mutateAsync({ jobId: job.jobId, idempotencyKey: randomUUID() });
      if (job.source === "upload") updateUpload(job.key, { jobId: next.id, phase: "queued" });
      else updateBatch(job.key, { jobId: next.id, phase: "queued" });
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : null;
      toast.error(mapErrorMessage(code, "Could not retry. Please try again."));
    }
  };

  return { download, cancel, retry, expired, dismiss, onDownload, onCancel, onRetry };
}
