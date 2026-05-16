import { AlertCircle, CheckCircle2, CircleX, Download, Files, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/pdf-compress/format";
import { useJobStream } from "@/features/pdf-compress/hooks/use-job-stream";
import {
  useCancelJobMutation,
  useDownloadUrlMutation,
  useRetryJobMutation,
} from "@/features/pdf-merge/api";
import { selectBatch, useMergeStore } from "@/features/pdf-merge/store";
import type { Job, JobStatus } from "@/features/pdf-merge/types";
import { cn } from "@/lib/utils";

export type MergeCardProps = {
  clientBatchId: string;
  onRetry?: (clientBatchId: string) => void;
};

const PHASE_LABELS: Record<string, string> = {
  queued: "Queued",
  downloading: "Reading files",
  merging: "Merging",
  uploading: "Saving",
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};

const PHASES_ORDER = ["queued", "downloading", "merging", "uploading", "done"];

function statusTone(
  status: JobStatus | undefined,
  phase: string | null,
): { label: string; className: string } {
  if (status === "succeeded") {
    return { label: "Completed", className: "text-emerald-600 dark:text-emerald-400" };
  }
  if (status === "failed") {
    return { label: "Failed", className: "text-destructive" };
  }
  if (status === "cancelled") {
    return { label: "Cancelled", className: "text-muted-foreground" };
  }
  const phaseLabel = phase ? (PHASE_LABELS[phase] ?? phase) : "Working";
  return { label: phaseLabel, className: "text-foreground" };
}

export function MergeCard({ clientBatchId, onRetry }: MergeCardProps) {
  const batch = useMergeStore(selectBatch(clientBatchId));
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const removeBatch = useMergeStore((s) => s.remove);

  const jobId = batch?.jobId ?? null;
  const jobQuery = useJobStream(jobId);
  const job: Job | null = jobQuery.data ?? null;

  const downloadMutation = useDownloadUrlMutation();
  const cancelMutation = useCancelJobMutation();
  const retryMutation = useRetryJobMutation();

  useEffect(() => {
    if (!batch || !job) return;
    if (job.status === "succeeded" && batch.phase !== "succeeded") {
      updateBatch(clientBatchId, { phase: "succeeded" });
    } else if (job.status === "failed" && batch.phase !== "failed") {
      updateBatch(clientBatchId, {
        phase: "failed",
        errorCode: job.errorCode ?? "unknown_error",
        errorMessage: job.errorMessage ?? "Merge failed.",
      });
    } else if (job.status === "cancelled" && batch.phase !== "cancelled") {
      updateBatch(clientBatchId, { phase: "cancelled" });
    } else if (job.status === "running" && batch.phase !== "running") {
      updateBatch(clientBatchId, { phase: "running" });
    } else if (
      job.status === "pending" &&
      batch.phase !== "queued" &&
      batch.phase !== "uploading"
    ) {
      updateBatch(clientBatchId, { phase: "queued" });
    }
  }, [job, batch, clientBatchId, updateBatch]);

  if (!batch) return null;

  const totalBytes = batch.files.reduce((sum, f) => sum + f.fileSize, 0);
  const uploadedBytes = batch.files.reduce((sum, f) => sum + f.bytesUploaded, 0);
  const isUploading = batch.phase === "uploading";

  const isTerminal =
    job?.status === "succeeded" ||
    job?.status === "failed" ||
    job?.status === "cancelled" ||
    batch.phase === "failed" ||
    batch.phase === "cancelled" ||
    batch.phase === "succeeded";

  const tone = statusTone(job?.status, job?.phase ?? null);
  const uploadPct =
    totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;

  const onDownload = async () => {
    if (!job) return;
    const result = await downloadMutation.mutateAsync({ jobId: job.id });
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const onCancel = async () => {
    if (job) {
      try {
        await cancelMutation.mutateAsync({ jobId: job.id });
      } catch {
        // ignore
      }
    }
    updateBatch(clientBatchId, { phase: "cancelled" });
  };

  const onDismiss = () => removeBatch(clientBatchId);

  const phaseIndex = job?.phase ? PHASES_ORDER.indexOf(job.phase) : -1;
  const summaryName = `${batch.files.length} PDFs · ${formatBytes(totalBytes)}`;
  const firstName = batch.files[0]?.fileName ?? "Untitled.pdf";

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6",
        isTerminal && job?.status === "succeeded" && "border-emerald-500/30",
        (batch.phase === "failed" || job?.status === "failed") && "border-destructive/40",
      )}
    >
      <header className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground">
          <Files className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{firstName}</p>
          <p className="text-xs text-muted-foreground">{summaryName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-semibold", tone.className)}>
            {batch.phase === "uploading" ? "Uploading" : tone.label}
          </span>
          {!isTerminal && job ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              aria-label="Cancel job"
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          {isTerminal ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </header>

      {isUploading ? (
        <div className="flex flex-col gap-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-200"
              style={{ width: `${uploadPct}%` }}
              aria-hidden
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
            </span>
            <span>{uploadPct}%</span>
          </div>
        </div>
      ) : null}

      {!isUploading && !isTerminal ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>{tone.label}…</span>
          </div>
          <div className="flex gap-1.5">
            {PHASES_ORDER.slice(0, 4).map((phase, idx) => (
              <div
                key={phase}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  phaseIndex >= idx ? "bg-foreground" : "bg-foreground/10",
                )}
                aria-hidden
              />
            ))}
          </div>
        </div>
      ) : null}

      {job?.status === "succeeded" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span className="text-sm font-semibold">Merge complete</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Files</p>
              <p className="font-semibold">{batch.files.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total in</p>
              <p className="font-semibold">{formatBytes(job.inputSizeBytes)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Output</p>
              <p className="font-semibold">{formatBytes(job.outputSizeBytes)}</p>
            </div>
          </div>
          <Button
            onClick={onDownload}
            disabled={downloadMutation.isPending}
            className="w-full sm:w-auto sm:self-start"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {downloadMutation.isPending ? "Preparing…" : "Download merged PDF"}
          </Button>
        </div>
      ) : null}

      {batch.phase === "failed" || job?.status === "failed" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Couldn't merge these files</p>
              <p className="text-xs text-muted-foreground">
                {job?.errorMessage ?? batch.errorMessage ?? "Something went wrong."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {job ? (
              <Button
                size="sm"
                onClick={async () => {
                  const next = await retryMutation.mutateAsync({
                    jobId: job.id,
                    idempotencyKey: crypto.randomUUID(),
                  });
                  updateBatch(clientBatchId, {
                    jobId: next.id,
                    phase: "queued",
                  });
                }}
                disabled={retryMutation.isPending}
                className="w-full sm:w-auto sm:self-start"
              >
                {retryMutation.isPending ? "Retrying…" : "Retry"}
              </Button>
            ) : null}
            {onRetry ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRetry(clientBatchId)}
                className="w-full sm:w-auto sm:self-start"
              >
                Dismiss and start over
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {job?.status === "cancelled" || batch.phase === "cancelled" ? (
        <div className="flex items-center gap-2 rounded-xl bg-foreground/5 p-3 text-xs text-muted-foreground">
          <CircleX className="h-4 w-4" aria-hidden />
          <span>Job cancelled.</span>
        </div>
      ) : null}
    </article>
  );
}
