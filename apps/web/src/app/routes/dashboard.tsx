import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileSignature,
  HardDrive,
  Lock,
  type LucideIcon,
  ScrollText,
} from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";
import { formatBytes } from "@/features/pdf-compress/format";
import type { Job, JobStatus } from "@/features/pdf-compress/types";
import { jobDisplayName, useJobsFeedQuery } from "@/features/pdf-tools/jobs-feed";
import { TOOL_ORDER, TOOL_PATH, TOOLS } from "@/features/studio/tools";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    const state = useAuthStore.getState();
    if (!state.hasAccess || state.user?.isAnonymous) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const greeting = user?.fullName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  const recent = useJobsFeedQuery({ status: "all" });
  const recentJobs = recent.data?.pages.flatMap((p) => p.items).slice(0, 6) ?? [];
  const succeeded = recentJobs.filter((j) => j.status === "succeeded").length;
  const failed = recentJobs.filter((j) => j.status === "failed").length;
  const totalBytes = recentJobs.reduce((sum, j) => sum + (j.outputSizeBytes ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 rounded-3xl border border-border/70 bg-card p-6 shadow-clay sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-primary uppercase">
            {organization?.name ?? "Workspace"}
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back, {greeting}.
          </h1>
          <p className="text-sm text-muted-foreground">
            Your jobs and downloads, all in one place. Jump back into the canvas anytime.
          </p>
        </div>
        <Button asChild variant="molten" size="lg" className="shrink-0">
          <Link to="/">
            <ScrollText />
            Open the Studio
          </Link>
        </Button>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Recent jobs"
          value={String(recentJobs.length)}
          hint={recent.isLoading ? "Loading…" : `${succeeded} done · ${failed} failed`}
          icon={Clock}
        />
        <StatCard
          label="Output saved"
          value={formatBytes(totalBytes)}
          hint="Last 6 jobs combined"
          icon={HardDrive}
        />
        <StatCard label="Plan" value="Free" hint="Up to 500 MB per file" icon={CheckCircle2} />
      </div>

      <section className="mt-10 flex flex-col gap-4">
        <SectionHeader title="Tools" subtitle="Everything you can run right now." />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {TOOL_ORDER.map((id) => {
            const tool = TOOLS[id];
            const Icon = tool.icon;
            return (
              <motion.div key={id} variants={staggerItem}>
                <Link
                  to={TOOL_PATH[id]}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-clay-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-clay"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary transition-colors group-hover:bg-molten group-hover:text-primary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-display text-base font-semibold">{tool.verb}</span>
                  <span className="text-xs text-muted-foreground">{tool.tagline}</span>
                  <span className="mt-auto inline-flex items-center text-xs font-medium text-primary/80 transition-colors group-hover:text-primary">
                    Open <ArrowUpRight className="ml-0.5 size-3" />
                  </span>
                </Link>
              </motion.div>
            );
          })}
          {[
            { icon: FileSignature, label: "Sign" },
            { icon: Lock, label: "Redact" },
          ].map((t) => (
            <div
              key={t.label}
              className="flex h-full flex-col gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-5 opacity-70"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                <t.icon className="size-5" />
              </span>
              <span className="font-display text-base font-semibold text-muted-foreground">
                {t.label}
              </span>
              <Badge tone="muted" className="self-start">
                Soon
              </Badge>
            </div>
          ))}
        </motion.div>
      </section>

      <section className="mt-10 flex flex-col gap-4">
        <SectionHeader
          title="Recent activity"
          subtitle="Your latest jobs across every tool."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/jobs">
                View all <ArrowRight />
              </Link>
            </Button>
          }
        />
        {recent.isLoading ? (
          <Skeleton />
        ) : recentJobs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            {recentJobs.map((job, idx) => (
              <li
                key={job.id}
                className={cn(
                  "flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
                  idx > 0 && "border-t border-border/70",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                    <ToolIcon kind={job.kind} />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{jobDisplayName(job)}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-12 sm:pl-0">
                  <StatusBadge status={job.status} />
                  {job.outputSizeBytes ? (
                    <span className="font-mono text-xs text-muted-foreground">
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
  );
}

function ToolIcon({ kind }: { kind: Job["kind"] }) {
  const tool = kind in TOOLS ? TOOLS[kind as keyof typeof TOOLS] : null;
  const Icon = tool?.icon ?? ScrollText;
  return <Icon className="size-4" />;
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
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
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
  value: string;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-4 shadow-clay-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="font-display text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
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
      {status}
    </Badge>
  );
}

function Skeleton() {
  return (
    <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      {["a", "b", "c"].map((k, idx) => (
        <li
          key={k}
          className={cn(
            "flex items-center gap-3 px-4 py-3.5",
            idx > 0 && "border-t border-border/70",
          )}
        >
          <span className="size-9 animate-pulse rounded-xl bg-muted" />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="h-3 w-32 animate-pulse rounded bg-muted" />
            <span className="h-2 w-44 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary">
        <ScrollText className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">No jobs yet</span>
        <span className="text-xs text-muted-foreground">
          Run your first PDF tool to see activity here.
        </span>
      </div>
      <Button asChild size="sm" variant="molten">
        <Link to="/">Open the Studio</Link>
      </Button>
    </div>
  );
}
