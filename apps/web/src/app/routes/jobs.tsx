import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CircleCheck,
  CircleX,
  Clock,
  Download,
  History,
  Layers,
  Loader2,
  Lock,
  type LucideIcon,
  ScanLine,
  Shuffle,
  Sparkles,
  Split,
  TextSelect,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { useDownloadUrlMutation } from "@/features/pdf-compress/api";
import { formatBytes } from "@/features/pdf-compress/format";
import type { Job, JobKind, JobStatus } from "@/features/pdf-compress/types";
import { jobDisplayName, useJobsFeedQuery } from "@/features/pdf-tools/jobs-feed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jobs")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: JobsPage,
});

type KindFilter = JobKind | "all";
type StatusFilter = JobStatus | "all";

type KindChip = { value: KindFilter; label: string; icon: LucideIcon };

const KIND_CHIPS: KindChip[] = [
  { value: "all", label: "All tools", icon: History },
  { value: "compress", label: "Compress", icon: Wand2 },
  { value: "merge", label: "Merge", icon: Layers },
  { value: "split", label: "Split", icon: Split },
  { value: "rotate", label: "Rotate", icon: Shuffle },
  { value: "reorder", label: "Reorder", icon: TextSelect },
  { value: "ocr", label: "OCR", icon: ScanLine },
];

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Done" },
  { value: "failed", label: "Failed" },
];

const KIND_ICON: Record<JobKind, LucideIcon> = {
  compress: Wand2,
  merge: Layers,
  split: Split,
  rotate: Shuffle,
  reorder: TextSelect,
  ocr: ScanLine,
  convert: Sparkles,
  redact: Lock,
  sign: Lock,
  metadata: Sparkles,
};

function JobsPage() {
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const query = useJobsFeedQuery({ kind, status });
  const downloadMutation = useDownloadUrlMutation();

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data],
  );

  const onDownload = async (jobId: string) => {
    const result = await downloadMutation.mutateAsync({ jobId });
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 xl:px-10">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <History className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/80">
                Activity
              </span>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">All jobs</h1>
              <p className="hidden text-[0.8rem] text-muted-foreground sm:block">
                Every PDF you've run through Papyrus. Files auto-expire after 24h.
              </p>
            </div>
          </div>
        </header>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {KIND_CHIPS.map((chip) => (
              <Chip
                key={chip.value}
                active={kind === chip.value}
                onClick={() => setKind(chip.value)}
                icon={chip.icon}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHIPS.map((chip) => (
              <Chip
                key={chip.value}
                active={status === chip.value}
                onClick={() => setStatus(chip.value)}
                tone="muted"
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        </div>

        {query.isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {items.map((job, idx) => (
                <JobRow
                  key={job.id}
                  job={job}
                  isFirst={idx === 0}
                  onDownload={() => onDownload(job.id)}
                  downloading={downloadMutation.isPending}
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
  icon: Icon,
  children,
  tone = "primary",
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  children: React.ReactNode;
  tone?: "primary" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? tone === "primary"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-foreground/20 bg-foreground/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:bg-accent hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

function JobRow({
  job,
  isFirst,
  onDownload,
  downloading,
}: {
  job: Job;
  isFirst: boolean;
  onDownload: () => void;
  downloading: boolean;
}) {
  const Icon = KIND_ICON[job.kind] ?? Sparkles;
  const name = jobDisplayName(job);
  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4",
        !isFirst && "border-t border-border",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={name}>
              {name}
            </span>
            <span className="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
              {job.kind}
            </span>
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {new Date(job.createdAt).toLocaleString()}
            {job.inputSizeBytes != null ? ` · ${formatBytes(job.inputSizeBytes)}` : ""}
            {job.outputSizeBytes != null ? ` → ${formatBytes(job.outputSizeBytes)}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <StatusBadge status={job.status} />
        {job.status === "succeeded" ? (
          <Button size="sm" variant="outline" onClick={onDownload} disabled={downloading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; className: string; icon: LucideIcon }> = {
    pending: {
      label: "Pending",
      className: "bg-muted text-muted-foreground",
      icon: Clock,
    },
    running: {
      label: "Running",
      className: "bg-primary/10 text-primary",
      icon: Loader2,
    },
    succeeded: {
      label: "Done",
      className: "bg-success/15 text-success",
      icon: CircleCheck,
    },
    failed: {
      label: "Failed",
      className: "bg-destructive/15 text-destructive",
      icon: CircleX,
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-muted text-muted-foreground",
      icon: CircleX,
    },
  };
  const v = map[status];
  const Icon = v.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        v.className,
      )}
    >
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {v.label}
    </span>
  );
}

function LoadingState() {
  return (
    <ul className="overflow-hidden rounded-2xl border border-border bg-card">
      {[1, 2, 3, 4].map((i) => (
        <li
          key={i}
          className={cn("flex items-center gap-3 px-4 py-3.5", i > 1 && "border-t border-border")}
        >
          <span className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
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
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <History className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">No jobs yet</span>
        <span className="max-w-sm text-xs text-muted-foreground">
          Run any PDF tool and your jobs will show up here. Files auto-expire after 24 hours.
        </span>
      </div>
      <Button asChild size="sm">
        <Link to="/tools/compress">Compress your first PDF</Link>
      </Button>
    </div>
  );
}
