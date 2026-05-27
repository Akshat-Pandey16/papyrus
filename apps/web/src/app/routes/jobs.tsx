import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, History, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { useDownloadUrlMutation } from "@/features/pdf-compress/api";
import { formatBytes } from "@/features/pdf-compress/format";
import type { Job, JobKind, JobStatus } from "@/features/pdf-compress/types";
import { triggerDownload } from "@/features/pdf-tools/download";
import { jobDisplayName, useJobsFeedQuery } from "@/features/pdf-tools/jobs-feed";
import { TOOL_ORDER, TOOLS } from "@/features/studio/tools";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jobs")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: JobsPage,
});

type KindFilter = JobKind | "all";
type StatusFilter = JobStatus | "all";

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Done" },
  { value: "failed", label: "Failed" },
];

function JobsPage() {
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const query = useJobsFeedQuery({ kind, status });
  const download = useDownloadUrlMutation();

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items), [query.data]);

  const onDownload = async (jobId: string) => {
    const r = await download.mutateAsync({ jobId });
    triggerDownload(r.url, r.filename);
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <header className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-molten text-primary-foreground shadow-clay-sm">
          <History className="size-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            All jobs
          </h1>
          <p className="text-sm text-muted-foreground">
            Everything you've run. Files auto-expire after 24 hours.
          </p>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={kind === "all"} onClick={() => setKind("all")}>
            All tools
          </Chip>
          {TOOL_ORDER.map((id) => (
            <Chip key={id} active={kind === id} onClick={() => setKind(id)}>
              {TOOLS[id].label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((c) => (
            <Chip
              key={c.value}
              active={status === c.value}
              onClick={() => setStatus(c.value)}
              tone="muted"
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <Skeleton />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              {items.map((job, idx) => (
                <JobRow
                  key={job.id}
                  job={job}
                  first={idx === 0}
                  onDownload={() => onDownload(job.id)}
                  downloading={download.isPending}
                />
              ))}
            </ul>
            {query.hasNextPage ? (
              <div className="mt-5 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone = "primary",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "primary" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? tone === "primary"
            ? "border-primary/30 bg-primary/12 text-primary"
            : "border-foreground/20 bg-foreground/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function JobRow({
  job,
  first,
  onDownload,
  downloading,
}: {
  job: Job;
  first: boolean;
  onDownload: () => void;
  downloading: boolean;
}) {
  const tool = job.kind in TOOLS ? TOOLS[job.kind as keyof typeof TOOLS] : null;
  const Icon = tool?.icon ?? ScrollText;
  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4",
        !first && "border-t border-border/70",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={jobDisplayName(job)}>
              {jobDisplayName(job)}
            </span>
            <Badge tone="muted" className="hidden capitalize sm:inline-flex">
              {job.kind}
            </Badge>
          </div>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {new Date(job.createdAt).toLocaleString()}
            {job.inputSizeBytes != null ? ` · ${formatBytes(job.inputSizeBytes)}` : ""}
            {job.outputSizeBytes != null ? ` → ${formatBytes(job.outputSizeBytes)}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 pl-12 sm:pl-0">
        <StatusBadge status={job.status} />
        {job.status === "succeeded" ? (
          <Button size="sm" variant="soft" onClick={onDownload} disabled={downloading}>
            <Download />
            Download
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const tone =
    status === "succeeded"
      ? "success"
      : status === "failed"
        ? "destructive"
        : status === "running"
          ? "primary"
          : "muted";
  return (
    <Badge tone={tone} className="capitalize">
      {status === "running" ? <Spinner className="size-3" /> : null}
      {status}
    </Badge>
  );
}

function Skeleton() {
  return (
    <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      {[1, 2, 3, 4].map((i) => (
        <li
          key={i}
          className={cn(
            "flex items-center gap-3 px-4 py-3.5",
            i > 1 && "border-t border-border/70",
          )}
        >
          <span className="size-9 animate-pulse rounded-xl bg-muted" />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="h-3 w-40 animate-pulse rounded bg-muted" />
            <span className="h-2 w-56 animate-pulse rounded bg-muted" />
          </div>
          <span className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-molten text-primary-foreground">
        <History className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">No jobs yet</span>
        <span className="max-w-sm text-xs text-muted-foreground">
          Run any PDF tool and your jobs will show up here.
        </span>
      </div>
      <Button asChild size="sm" variant="molten">
        <Link to="/">Open the Studio</Link>
      </Button>
    </div>
  );
}
