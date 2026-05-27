import { AlertCircle, CheckCircle2, CircleX, Download, FileText, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useCancelJobMutation, useRetryJobMutation } from "@/features/pdf-compress/api";
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatThroughput,
} from "@/features/pdf-compress/format";
import { useJobStream } from "@/features/pdf-compress/hooks/use-job-stream";
import { useThroughput } from "@/features/pdf-compress/hooks/use-throughput";
import { selectUpload, useUploadStore } from "@/features/pdf-compress/store";
import type { Job, JobStatus } from "@/features/pdf-compress/types";
import { triggerDownload } from "@/features/pdf-tools/download";
import { useAutoDownload } from "@/features/pdf-tools/use-auto-download";
import { mapErrorMessage } from "@/lib/api/error-message";
import { cn } from "@/lib/utils";
import { randomUUID } from "@/lib/uuid";

export type CompressionCardProps = {
  clientUploadId: string;
  onRetry?: (clientUploadId: string) => void;
};

const PHASE_LABELS: Record<string, string> = {
  queued: "Queued",
  downloading: "Reading file",
  compressing: "Compressing",
  uploading: "Saving",
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};

const PHASES_ORDER = ["queued", "downloading", "compressing", "uploading", "done"];

function statusTone(
  status: JobStatus | undefined,
  phase: string | null,
): {
  label: string;
  className: string;
} {
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

export function CompressionCard({ clientUploadId, onRetry }: CompressionCardProps) {
  const entry = useUploadStore(selectUpload(clientUploadId));
  const updateEntry = useUploadStore((s) => s.update);
  const removeEntry = useUploadStore((s) => s.remove);

  const jobId = entry?.jobId ?? null;
  const jobQuery = useJobStream(jobId);
  const job: Job | null = jobQuery.data ?? null;

  const downloadMutation = useAutoDownload(job);
  const cancelMutation = useCancelJobMutation();
  const retryMutation = useRetryJobMutation();

  useEffect(() => {
    if (!entry || !job) return;
    if (job.status === "succeeded" && entry.phase !== "succeeded") {
      updateEntry(clientUploadId, { phase: "succeeded" });
    } else if (job.status === "failed" && entry.phase !== "failed") {
      updateEntry(clientUploadId, {
        phase: "failed",
        errorCode: job.errorCode ?? "unknown_error",
        errorMessage: job.errorMessage ?? "Compression failed.",
      });
    } else if (job.status === "cancelled" && entry.phase !== "cancelled") {
      updateEntry(clientUploadId, { phase: "cancelled" });
    } else if (job.status === "running" && entry.phase !== "running") {
      updateEntry(clientUploadId, { phase: "running" });
    } else if (
      job.status === "pending" &&
      entry.phase !== "queued" &&
      entry.phase !== "preparing" &&
      entry.phase !== "uploading" &&
      entry.phase !== "uploaded"
    ) {
      updateEntry(clientUploadId, { phase: "queued" });
    }
  }, [job, entry, clientUploadId, updateEntry]);

  const isUploading = entry?.phase === "uploading" || entry?.phase === "preparing";
  const throughput = useThroughput(entry?.bytesUploaded ?? 0, !!isUploading);

  if (!entry) return null;

  const isTerminal =
    job?.status === "succeeded" ||
    job?.status === "failed" ||
    job?.status === "cancelled" ||
    entry.phase === "failed" ||
    entry.phase === "cancelled" ||
    entry.phase === "succeeded";

  const tone = statusTone(job?.status, job?.phase ?? null);
  const uploadPct =
    entry.bytesTotal > 0
      ? Math.min(100, Math.round((entry.bytesUploaded / entry.bytesTotal) * 100))
      : 0;

  const onDownload = async () => {
    if (!job) return;
    const result = await downloadMutation.mutateAsync({ jobId: job.id });
    triggerDownload(result.url, result.filename);
  };

  const onCancel = async () => {
    if (job) {
      try {
        await cancelMutation.mutateAsync({ jobId: job.id });
      } catch {}
    }
    updateEntry(clientUploadId, { phase: "cancelled" });
  };

  const onDismiss = () => removeEntry(clientUploadId);

  const phaseIndex = job?.phase ? PHASES_ORDER.indexOf(job.phase) : -1;

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6",
        isTerminal && job?.status === "succeeded" && "border-emerald-500/30",
        (entry.phase === "failed" || job?.status === "failed") && "border-destructive/40",
      )}
    >
      <header className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground">
          <FileText className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={entry.fileName}>
            {entry.fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(entry.fileSize)} · {entry.level} compression
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-semibold", tone.className)} aria-live="polite">
            {entry.phase === "preparing" || entry.phase === "uploading" ? "Uploading" : tone.label}
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
              {formatBytes(entry.bytesUploaded)} / {formatBytes(entry.bytesTotal)} ·{" "}
              {formatThroughput(throughput)}
            </span>
            <span>ETA {formatEta(entry.bytesUploaded, entry.bytesTotal, throughput)}</span>
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
            <span className="text-sm font-semibold">Compression complete</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Original</p>
              <p className="font-semibold">{formatBytes(job.inputSizeBytes)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Compressed</p>
              <p className="font-semibold">{formatBytes(job.outputSizeBytes)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Saved</p>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatPercent(job.compressionRatio)}
              </p>
            </div>
          </div>
          <Button
            onClick={onDownload}
            disabled={downloadMutation.isPending}
            className="w-full sm:w-auto sm:self-start"
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {downloadMutation.isPending ? "Preparing…" : "Download"}
          </Button>
        </div>
      ) : null}

      {entry.phase === "failed" || job?.status === "failed" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Couldn't compress this file</p>
              <p className="text-xs text-muted-foreground">
                {mapErrorMessage(
                  job?.errorCode ?? entry.errorCode,
                  job?.errorMessage ?? entry.errorMessage,
                )}
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
                    idempotencyKey: randomUUID(),
                  });
                  updateEntry(clientUploadId, {
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
                onClick={() => onRetry(clientUploadId)}
                className="w-full sm:w-auto sm:self-start"
              >
                Dismiss and start over
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {job?.status === "cancelled" || entry.phase === "cancelled" ? (
        <div className="flex items-center gap-2 rounded-xl bg-foreground/5 p-3 text-xs text-muted-foreground">
          <CircleX className="h-4 w-4" aria-hidden />
          <span>Job cancelled.</span>
        </div>
      ) : null}
    </article>
  );
}
