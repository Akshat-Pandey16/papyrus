import { Code2, Timer, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dropzone } from "@/features/studio/dropzone";
import type { ToolMeta } from "@/features/studio/tools";

const TRUST = [
  { icon: Zap, label: "No sign-up" },
  { icon: Timer, label: "Gone in 24h" },
  { icon: Code2, label: "Open source" },
];

export function StudioHero({
  tool,
  generic,
  multi,
  accept,
  onFiles,
}: {
  tool: ToolMeta;
  generic: boolean;
  multi: boolean;
  accept: "pdf" | "image";
  onFiles: (files: File[]) => void;
}) {
  const Icon = tool.icon;
  const noun = accept === "image" ? (multi ? "images" : "an image") : multi ? "PDFs" : "a PDF";

  return (
    <div className="mx-auto grid w-full max-w-[1200px] items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14 lg:py-14">
      <div className="order-2 flex flex-col items-start gap-6 text-left lg:order-1">
        <Badge tone="primary" className="gap-1.5">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
          {generic ? "16 tools · zero friction" : tool.label}
        </Badge>

        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {generic ? (
            <>
              Every PDF task,
              <br className="hidden sm:block" />{" "}
              <span className="text-molten">one quiet drop.</span>
            </>
          ) : (
            <>
              <span className="text-molten">{tool.verb}</span> {noun}.
            </>
          )}
        </h1>

        <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
          {generic
            ? "Compress, merge, sign, redact and more. Drop a file and it just works — no account, nothing to wrangle, nothing left behind."
            : `${tool.tagline}. Drop your file and run it in seconds — no account, nothing kept.`}
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          {TRUST.map((t) => (
            <span
              key={t.label}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70"
            >
              <t.icon className="size-4 text-primary" strokeWidth={2.2} />
              {t.label}
            </span>
          ))}
        </div>

        {generic ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" strokeWidth={2.1} />
            </span>
            <span>
              Starts with <span className="font-medium text-foreground">{tool.label}</span> — press{" "}
              <kbd className="rounded-md border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>{" "}
              to switch.
            </span>
          </div>
        ) : null}
      </div>

      <Dropzone
        onFiles={onFiles}
        multi={multi}
        accept={accept}
        variant="panel"
        className="order-1 w-full lg:order-2"
      />
    </div>
  );
}
