import {
  Check,
  Download,
  FileText,
  Layers,
  ListOrdered,
  type LucideIcon,
  RotateCw,
  ScanLine,
  Scissors,
  TriangleAlert,
  Wand2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes, formatPercent } from "@/features/pdf-compress/format";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useMergeStore } from "@/features/pdf-merge/store";
import {
  useCancelJobMutation,
  useDownloadUrlMutation,
  useJobQuery,
  useRetryJobMutation,
} from "@/features/pdf-tools/api";
import { triggerDownload } from "@/features/pdf-tools/download";
import { isActivePhase, type SessionJob } from "@/features/studio/session-jobs";
import { mapErrorMessage } from "@/lib/api/error-message";
import { cn } from "@/lib/utils";
import { randomUUID } from "@/lib/uuid";

const KIND_ICON: Record<string, LucideIcon> = {
  compress: Wand2,
  merge: Layers,
  split: Scissors,
  rotate: RotateCw,
  reorder: ListOrdered,
  ocr: ScanLine,
};

const PHASE_LABEL: Record<string, string> = {
  preparing: "Preparing",
  uploading: "Uploading",
  uploaded: "Uploaded",
  queued: "Queued",
  pending: "Queued",
  running: "Processing",
};

export function ResultCard({ job }: { job: SessionJob }) {
  const { data: remote } = useJobQuery(job.jobId ?? null);
  const removeUpload = useUploadStore((s) => s.remove);
  const updateUpload = useUploadStore((s) => s.update);
  const removeBatch = useMergeStore((s) => s.remove);
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const download = useDownloadUrlMutation();
  const cancel = useCancelJobMutation();
  const retry = useRetryJobMutation();

  const status = remote?.status;
  const phase = job.phase;
  const succeeded = status === "succeeded" || phase === "succeeded";
  const failed = status === "failed" || phase === "failed";
  const cancelled = status === "cancelled" || phase === "cancelled";
  const terminal = succeeded || failed || cancelled;
  const active =
    !terminal && (isActivePhase(phase) || status === "running" || status === "pending");

  const Icon = KIND_ICON[job.kind] ?? FileText;
  const serverPhase = remote?.phase && status === "running" ? remote.phase : null;
  const label = serverPhase ?? PHASE_LABEL[phase] ?? "Working";

  const dismiss = () => (job.source === "upload" ? removeUpload(job.key) : removeBatch(job.key));

  const onDownload = async () => {
    if (!job.jobId) return;
    const r = await download.mutateAsync({ jobId: job.jobId });
    triggerDownload(r.url, r.filename);
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
    if (!job.jobId) return;
    const next = await retry.mutateAsync({ jobId: job.jobId, idempotencyKey: randomUUID() });
    if (job.source === "upload") updateUpload(job.key, { jobId: next.id, phase: "queued" });
    else updateBatch(job.key, { jobId: next.id, phase: "queued" });
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4",
        succeeded && "border-success/40",
        failed && "border-destructive/40",
        !terminal && "border-border/70",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            succeeded
              ? "bg-success/15 text-success"
              : failed
                ? "bg-destructive/12 text-destructive"
                : "bg-primary/12 text-primary",
          )}
        >
          {succeeded ? (
            <Check className="size-5" />
          ) : failed ? (
            <TriangleAlert className="size-5" />
          ) : (
            <Icon className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={job.title}>
            {job.title}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="capitalize">{job.kind}</span>
            {job.sizeBytes ? <span>· {formatBytes(job.sizeBytes)}</span> : null}
          </p>
        </div>
        {active ? (
          <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel">
            <X />
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss">
            <X />
          </Button>
        )}
      </div>

      {active ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Spinner className="size-3.5 text-primary" />
            <span>{label}…</span>
          </div>
          <Progress indeterminate />
        </div>
      ) : null}

      {succeeded ? (
        <div className="flex flex-col gap-3 rounded-xl bg-success/8 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge tone="success">
              <Check />
              Done
            </Badge>
            {remote?.compressionRatio != null ? (
              <span className="font-mono text-xs font-medium text-success">
                {formatPercent(remote.compressionRatio)}
              </span>
            ) : null}
            {remote?.inputSizeBytes != null && remote?.outputSizeBytes != null ? (
              <span className="font-mono text-xs text-muted-foreground">
                {formatBytes(remote.inputSizeBytes)} → {formatBytes(remote.outputSizeBytes)}
              </span>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="soft"
            onClick={onDownload}
            disabled={download.isPending}
            className="self-start"
          >
            <Download />
            {download.isPending ? "Preparing…" : "Download again"}
          </Button>
        </div>
      ) : null}

      {failed ? (
        <div className="flex flex-col gap-3 rounded-xl bg-destructive/8 p-3">
          <p className="text-xs text-muted-foreground">
            {mapErrorMessage(
              remote?.errorCode ?? job.errorCode,
              remote?.errorMessage ?? job.errorMessage,
            )}
          </p>
          {job.jobId ? (
            <Button size="sm" onClick={onRetry} disabled={retry.isPending} className="self-start">
              {retry.isPending ? "Retrying…" : "Try again"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {cancelled ? <p className="text-xs text-muted-foreground">Cancelled.</p> : null}
    </motion.article>
  );
}
