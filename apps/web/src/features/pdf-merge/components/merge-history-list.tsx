import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/features/pdf-compress/format";
import { useDownloadUrlMutation, useMergeJobsInfiniteQuery } from "@/features/pdf-merge/api";
import type { Job } from "@/features/pdf-merge/types";

function StatusPill({ status }: { status: Job["status"] }) {
  const map: Record<Job["status"], { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-foreground/10 text-foreground" },
    running: { label: "Running", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
    succeeded: {
      label: "Succeeded",
      className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
    cancelled: {
      label: "Cancelled",
      className: "bg-foreground/10 text-muted-foreground",
    },
  };
  const v = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.className}`}>{v.label}</span>
  );
}

function inputCount(job: Job): number {
  const ids = job.params.document_ids;
  if (Array.isArray(ids)) return ids.length;
  const inputs = job.params.inputs;
  if (Array.isArray(inputs)) return inputs.length;
  return 0;
}

function firstFilename(job: Job): string {
  const names = job.params.input_filenames;
  if (Array.isArray(names) && typeof names[0] === "string") return names[0];
  return "Untitled.pdf";
}

export function MergeHistoryList() {
  const query = useMergeJobsInfiniteQuery({});
  const downloadMutation = useDownloadUrlMutation();

  const onDownload = async (jobId: string) => {
    const result = await downloadMutation.mutateAsync({ jobId });
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  if (query.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading recent jobs…
      </div>
    );
  }

  const items = (query.data?.pages ?? []).flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
        No merge jobs yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {items.map((job) => {
          const count = inputCount(job);
          const first = firstFilename(job);
          return (
            <li
              key={job.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {first}
                  {count > 1 ? ` + ${count - 1} more` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(job.createdAt).toLocaleString()} · {count} files ·{" "}
                  {formatBytes(job.inputSizeBytes)}
                  {job.outputSizeBytes != null ? ` → ${formatBytes(job.outputSizeBytes)}` : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={job.status} />
                {job.status === "succeeded" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownload(job.id)}
                    disabled={downloadMutation.isPending}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Download
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {query.hasNextPage ? (
        <Button
          variant="outline"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="self-center"
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
