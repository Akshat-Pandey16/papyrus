import type { ReactNode } from "react";
import { PrivacyToggle } from "@/features/studio/privacy-toggle";
import { TOOLS } from "@/features/studio/tools";
import type { ToolId } from "@/features/studio/types";

export function InspectorFrame({
  toolId,
  children,
  footer,
}: {
  toolId: ToolId;
  children: ReactNode;
  footer: ReactNode;
}) {
  const tool = TOOLS[toolId];
  const Icon = tool.icon;
  return (
    <div className="flex max-h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 p-5 pb-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-molten text-primary-foreground shadow-clay-sm">
          <Icon className="size-5" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-tight">{tool.verb} PDF</h2>
          <p className="truncate text-xs text-muted-foreground">{tool.tagline}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">{children}</div>
      <footer className="flex flex-col gap-3 border-t border-border/60 p-5 pt-4">
        <PrivacyToggle />
        {footer}
      </footer>
    </div>
  );
}

export function InspectorSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-xs font-semibold tracking-wide text-foreground uppercase">{label}</h3>
        {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
