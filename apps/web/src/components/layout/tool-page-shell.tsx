import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ZeroRetentionToggle } from "@/components/shared/zero-retention-toggle";
import { cn } from "@/lib/utils";

type ToolPageShellProps = {
  tag: string;
  title: string;
  description: string;
  icon: LucideIcon;
  workspace: ReactNode;
  options: ReactNode;
  active?: ReactNode;
  headerActions?: ReactNode;
};

export function ToolPageShell({
  tag,
  title,
  description,
  icon: Icon,
  workspace,
  options,
  active,
  headerActions,
}: ToolPageShellProps) {
  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 xl:px-10">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/80">
                {tag}
              </span>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
              <p className="hidden text-[0.8rem] text-muted-foreground sm:block">{description}</p>
            </div>
          </div>
          {headerActions ? (
            <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
          ) : null}
        </header>

        <p className="mb-5 text-sm text-muted-foreground sm:hidden">{description}</p>

        {active ? <div className="mb-6">{active}</div> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="flex min-w-0 flex-col gap-5">{workspace}</div>
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[88px] lg:max-h-[calc(100svh-104px)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              {options}
            </div>
            <ZeroRetentionToggle />
          </aside>
        </div>
      </div>
    </div>
  );
}

export function ToolOptionsHeader({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function ToolHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] leading-relaxed text-muted-foreground", className)}>{children}</p>
  );
}
