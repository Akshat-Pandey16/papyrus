import { ArrowRight, Check, Download, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes, formatPercent } from "@/features/pdf-compress/format";
import { useJobQuery } from "@/features/pdf-tools/api";
import { useStudioChrome } from "@/features/studio/chrome-store";
import { isActivePhase, type SessionJob, useSessionJobs } from "@/features/studio/session-jobs";
import { useJobActions } from "@/features/studio/use-job-actions";
import { mapErrorMessage } from "@/lib/api/error-message";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<string, string> = {
  preparing: "Preparing",
  uploading: "Uploading",
  uploaded: "Uploaded",
  queued: "Queued",
  pending: "Queued",
  running: "Working",
};

export function JobStatusBar() {
  const jobs = useSessionJobs();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const job = jobs[0] ?? null;

  return (
    <AnimatePresence mode="wait">
      {job && job.key !== dismissedKey ? (
        <StatusRow key={job.key} job={job} onDismiss={() => setDismissedKey(job.key)} />
      ) : null}
    </AnimatePresence>
  );
}

function StatusRow({ job, onDismiss }: { job: SessionJob; onDismiss: () => void }) {
  const { data: remote } = useJobQuery(job.jobId ?? null);
  const { download, retry, expired, onDownload, onCancel, onRetry } = useJobActions(job);
  const openResults = useStudioChrome((s) => s.setResultsOpen);

  const status = remote?.status;
  const phase = job.phase;
  const succeeded = status === "succeeded" || phase === "succeeded";
  const failed = status === "failed" || phase === "failed";
  const cancelled = status === "cancelled" || phase === "cancelled";
  const terminal = succeeded || failed || cancelled;
  const active =
    !terminal && (isActivePhase(phase) || status === "running" || status === "pending");

  if (cancelled) return null;

  const serverPhase = remote?.phase && status === "running" ? remote.phase : null;
  const label = serverPhase ?? PHASE_LABEL[phase] ?? "Working";
  const uploading = phase === "uploading" && job.bytesTotal != null && job.bytesTotal > 0;
  const uploadPct = uploading
    ? Math.round(((job.bytesUploaded ?? 0) / (job.bytesTotal ?? 1)) * 100)
    : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className={cn(
        "flex flex-col gap-2.5 rounded-2xl border px-4 py-3",
        succeeded ? "border-success/40 bg-success/[0.07]" : null,
        failed ? "border-destructive/40 bg-destructive/[0.07]" : null,
        active ? "border-border/70 bg-card" : null,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            succeeded ? "bg-success/15 text-success" : null,
            failed ? "bg-destructive/12 text-destructive" : null,
            active ? "bg-primary/10 text-primary" : null,
          )}
        >
          {succeeded ? (
            <Check className="size-4" />
          ) : failed ? (
            <TriangleAlert className="size-4" />
          ) : (
            <Spinner className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {succeeded
              ? expired
                ? "Erased from our servers"
                : "Saved to your device"
              : failed
                ? "Couldn't finish this one"
                : `${uploading ? "Uploading" : label}…`}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={job.title}>
            {succeeded && remote?.compressionRatio != null ? (
              <span className="font-medium text-success">
                {formatPercent(remote.compressionRatio)} smaller ·{" "}
              </span>
            ) : null}
            {failed
              ? mapErrorMessage(
                  remote?.errorCode ?? job.errorCode,
                  remote?.errorMessage ?? job.errorMessage,
                )
              : job.title}
            {succeeded && remote?.outputSizeBytes != null ? (
              <span className="font-mono"> · {formatBytes(remote.outputSizeBytes)}</span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {succeeded && !expired ? (
            <Button variant="soft" size="sm" onClick={onDownload} disabled={download.isPending}>
              <Download />
              <span className="hidden sm:inline">
                {download.isPending ? "Preparing…" : "Download"}
              </span>
            </Button>
          ) : null}
          {failed && job.jobId ? (
            <Button size="sm" onClick={onRetry} disabled={retry.isPending}>
              {retry.isPending ? "Retrying…" : "Try again"}
            </Button>
          ) : null}
          {active ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openResults(true)}
                className="hidden sm:inline-flex"
              >
                All results
                <ArrowRight />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss">
                <X />
              </Button>
            </>
          )}
        </div>
      </div>

      {active ? uploading ? <Progress value={uploadPct} /> : <Progress indeterminate /> : null}
    </motion.div>
  );
}
