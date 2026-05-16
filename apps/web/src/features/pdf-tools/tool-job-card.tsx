import { AlertCircle, CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/pdf-compress/format";
import { useJobStream } from "@/features/pdf-compress/hooks/use-job-stream";
import { selectUpload, useUploadStore } from "@/features/pdf-compress/store";
import { useDownloadUrlMutation, useRetryJobMutation } from "@/features/pdf-tools/api";
import { cn } from "@/lib/utils";

export type ToolJobCardProps = {
  clientUploadId: string;
  successLabel?: string;
};

export function ToolJobCard({ clientUploadId, successLabel = "Done" }: ToolJobCardProps) {
  const entry = useUploadStore(selectUpload(clientUploadId));
  const removeEntry = useUploadStore((s) => s.remove);
  const updateEntry = useUploadStore((s) => s.update);

  const jobId = entry?.jobId ?? null;
  const stream = useJobStream(jobId);
  const job = stream.data ?? null;
  const download = useDownloadUrlMutation();
  const retry = useRetryJobMutation();

  useEffect(() => {
    if (!entry || !job) return;
    if (job.status === "succeeded" && entry.phase !== "succeeded") {
      updateEntry(clientUploadId, { phase: "succeeded" });
      void download
        .mutateAsync({ jobId: job.id })
        .then((res) => {
          const a = document.createElement("a");
          a.href = res.url;
          a.rel = "noopener noreferrer";
          a.target = "_blank";
          a.download = res.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        })
        .catch(() => undefined);
    } else if (job.status === "failed" && entry.phase !== "failed") {
      updateEntry(clientUploadId, {
        phase: "failed",
        errorCode: job.errorCode ?? "unknown_error",
        errorMessage: job.errorMessage ?? "Job failed.",
      });
    } else if (job.status === "cancelled" && entry.phase !== "cancelled") {
      updateEntry(clientUploadId, { phase: "cancelled" });
    } else if (job.status === "running" && entry.phase !== "running") {
      updateEntry(clientUploadId, { phase: "running" });
    } else if (
      job.status === "pending" &&
      entry.phase !== "queued" &&
      entry.phase !== "uploading"
    ) {
      updateEntry(clientUploadId, { phase: "queued" });
    }
  }, [job, entry, clientUploadId, updateEntry, download]);

  if (!entry) return null;

  const isTerminal =
    job?.status === "succeeded" ||
    job?.status === "failed" ||
    job?.status === "cancelled" ||
    entry.phase === "succeeded" ||
    entry.phase === "failed" ||
    entry.phase === "cancelled";

  const succeeded = job?.status === "succeeded";
  const failed = entry.phase === "failed" || job?.status === "failed";

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:p-6",
        succeeded && "border-emerald-500/30",
        failed && "border-destructive/40",
      )}
    >
      <header className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground/5">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={entry.fileName}>
            {entry.fileName}
          </p>
          <p className="text-xs text-muted-foreground">{formatBytes(entry.fileSize)}</p>
        </div>
        {isTerminal ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => removeEntry(clientUploadId)}
            className="text-xs"
          >
            Dismiss
          </Button>
        ) : null}
      </header>

      {!isTerminal ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{job?.phase ? `${job.phase}…` : "Working…"}</span>
        </div>
      ) : null}

      {succeeded ? (
        <div className="flex flex-col gap-3 rounded-xl bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold">{successLabel}</span>
            <span className="text-xs text-muted-foreground">Download started automatically.</span>
          </div>
          <Button
            onClick={async () => {
              if (!job) return;
              const r = await download.mutateAsync({ jobId: job.id });
              window.open(r.url, "_blank", "noopener,noreferrer");
            }}
            size="sm"
            variant="outline"
            className="self-start"
          >
            <Download className="mr-2 h-4 w-4" />
            Download again
          </Button>
        </div>
      ) : null}

      {failed ? (
        <div className="flex flex-col gap-3 rounded-xl bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Couldn&apos;t finish</p>
              <p className="text-xs text-muted-foreground">
                {job?.errorMessage ?? entry.errorMessage ?? "Something went wrong."}
              </p>
            </div>
          </div>
          {job ? (
            <Button
              size="sm"
              onClick={async () => {
                const next = await retry.mutateAsync({
                  jobId: job.id,
                  idempotencyKey: crypto.randomUUID(),
                });
                updateEntry(clientUploadId, { jobId: next.id, phase: "queued" });
              }}
              className="self-start"
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
