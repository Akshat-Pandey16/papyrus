import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileSignature,
  Files,
  Layers,
  Lock,
  type LucideIcon,
  ScanLine,
  Split,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
import { useJobsInfiniteQuery } from "@/features/pdf-compress/api";
import { formatBytes } from "@/features/pdf-compress/format";
import type { Job } from "@/features/pdf-compress/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    if (!useAuthStore.getState().hasAccess) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardPage,
});

type ToolCard = {
  title: string;
  desc: string;
  icon: LucideIcon;
  to?: string;
  accent?: string;
};

const TOOLS: ToolCard[] = [
  {
    title: "Compress",
    desc: "Shrink PDFs without losing quality.",
    icon: Wand2,
    to: "/tools/compress",
    accent: "from-violet-500/15 to-violet-500/0",
  },
  {
    title: "Merge",
    desc: "Combine multiple PDFs into one.",
    icon: Layers,
    to: "/tools/merge",
    accent: "from-emerald-500/15 to-emerald-500/0",
  },
  { title: "Split", desc: "Pull or split pages out.", icon: Split },
  { title: "OCR", desc: "Make scans searchable.", icon: ScanLine },
  { title: "Sign", desc: "Add signatures and seals.", icon: FileSignature },
  { title: "Redact", desc: "Permanently remove data.", icon: Lock },
];

function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const greeting = user?.fullName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  const recent = useJobsInfiniteQuery({ status: "all" });
  const recentJobs = recent.data?.pages.flatMap((p) => p.items).slice(0, 5) ?? [];

  const succeeded = recentJobs.filter((j) => j.status === "succeeded").length;
  const failed = recentJobs.filter((j) => j.status === "failed").length;
  const totalBytes = recentJobs.reduce((sum, j) => sum + (j.outputSizeBytes ?? 0), 0);

  return (
    <div className="w-full px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {organization?.name ?? "Workspace"}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome back, {greeting}.
          </h1>
          <p className="text-sm text-muted-foreground sm:text-[0.95rem]">
            Pick a tool to start. Recent jobs and outputs appear here as soon as workers finish.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Recent jobs"
            value={recentJobs.length}
            icon={Clock}
            hint={recent.isLoading ? "Loading…" : `${succeeded} succeeded · ${failed} failed`}
          />
          <StatCard
            label="Output bytes"
            value={formatBytes(totalBytes)}
            icon={Files}
            hint="Last 5 jobs combined"
          />
          <StatCard label="Plan" value="Free" icon={CheckCircle2} hint="Up to 500 MB per file" />
        </div>

        <section className="flex flex-col gap-4">
          <SectionHeader title="Tools" subtitle="Everything you can run right now." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <ToolTile key={tool.title} tool={tool} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Recent activity"
            subtitle="Your most recent jobs across every tool."
            action={
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link to="/tools/compress">
                  View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
          {recent.isLoading ? (
            <RecentSkeleton />
          ) : recentJobs.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
              {recentJobs.map((job, idx) => (
                <li
                  key={job.id}
                  className={cn(
                    "flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                    idx > 0 && "border-t border-border",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground">
                      {job.kind === "merge" ? (
                        <Layers className="h-4 w-4" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium capitalize">{job.kind}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <StatusBadge status={job.status} />
                    {job.outputSizeBytes ? (
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(job.outputSizeBytes)}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function ToolTile({ tool }: { tool: ToolCard }) {
  const className = cn(
    "group relative overflow-hidden flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all",
    tool.to
      ? "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg"
      : "cursor-not-allowed opacity-60",
  );
  const Icon = tool.icon;
  const inner = (
    <>
      {tool.accent ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 -z-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-100",
            tool.accent,
          )}
        />
      ) : null}
      <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-foreground/5 text-foreground/80 transition-colors group-hover:bg-foreground group-hover:text-background">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="relative flex flex-col gap-1">
        <span className="text-base font-semibold">{tool.title}</span>
        <span className="text-sm text-muted-foreground">{tool.desc}</span>
      </div>
      {tool.to ? (
        <span className="relative mt-1 inline-flex items-center text-xs font-medium text-foreground/70 transition-colors group-hover:text-foreground">
          Open <ArrowUpRight className="ml-1 h-3 w-3" />
        </span>
      ) : (
        <span className="relative mt-1 inline-block w-fit rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Coming soon
        </span>
      )}
    </>
  );

  if (tool.to) {
    return (
      <Link to={tool.to} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

function StatusBadge({ status }: { status: Job["status"] }) {
  const styles: Record<Job["status"], string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    succeeded: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    failed: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function RecentSkeleton() {
  const placeholders = ["a", "b", "c"];
  return (
    <ul className="overflow-hidden rounded-xl border border-border bg-card">
      {placeholders.map((key, idx) => (
        <li
          key={key}
          className={cn("flex items-center gap-3 px-4 py-3", idx > 0 && "border-t border-border")}
        >
          <span className="h-8 w-8 animate-pulse rounded-lg bg-foreground/5" />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="h-3 w-24 animate-pulse rounded bg-foreground/5" />
            <span className="h-2 w-40 animate-pulse rounded bg-foreground/5" />
          </div>
          <span className="h-4 w-14 animate-pulse rounded-full bg-foreground/5" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-foreground/5 text-foreground">
        <Files className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">No jobs yet</span>
        <span className="text-xs text-muted-foreground">
          Run your first PDF tool to see activity here.
        </span>
      </div>
      <Button asChild size="sm">
        <Link to="/tools/compress">Compress your first PDF</Link>
      </Button>
    </div>
  );
}
