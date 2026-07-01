import { Code2, Timer, Zap } from "lucide-react";
import { Dropzone } from "@/features/studio/dropzone";
import { ToolGrid } from "@/features/studio/tool-grid";
import { TOOL_ORDER, type ToolMeta } from "@/features/studio/tools";

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
  accept: "pdf" | "image" | "office";
  onFiles: (files: File[]) => void;
}) {
  const noun =
    accept === "image"
      ? multi
        ? "images"
        : "an image"
      : accept === "office"
        ? multi
          ? "documents"
          : "a document"
        : multi
          ? "PDFs"
          : "a PDF";

  return (
    <div className="w-full">
      <div className="relative flex min-h-[calc(100svh-4rem)] w-full items-center overflow-hidden px-6 py-12 sm:px-10 lg:px-16 2xl:px-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(70% 60% at 88% 12%, color-mix(in oklch, var(--color-primary) 10%, transparent), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-grain opacity-[0.025]"
        />

        <div className="grid w-full items-center gap-12 lg:grid-cols-[1fr_minmax(380px,0.8fr)] lg:gap-16 xl:gap-24">
          <div className="flex flex-col items-start gap-6">
            <span className="font-mono text-[0.72rem] tracking-[0.22em] text-muted-foreground uppercase">
              {generic ? `${TOOL_ORDER.length} tools · no sign-up · open source` : tool.tagline}
            </span>

            <h1 className="font-display text-6xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-7xl xl:text-8xl">
              {generic ? (
                <>
                  Every PDF task,
                  <br />
                  <span className="text-primary italic">one quiet drop.</span>
                </>
              ) : (
                <>
                  <span className="text-primary italic">{tool.verb}</span> {noun}.
                </>
              )}
            </h1>

            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              {generic
                ? "Compress, merge, sign, redact — drop a file and it just works. No account, nothing to wrangle, nothing left behind."
                : `${tool.tagline}. Drop it and go — no account, nothing kept.`}
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
              {TRUST.map((t) => (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1.5 text-sm text-foreground/75"
                >
                  <t.icon className="size-4 text-primary" strokeWidth={2.2} />
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          <Dropzone
            onFiles={onFiles}
            multi={multi}
            accept={accept}
            variant="sheet"
            className="w-full"
          />
        </div>
      </div>

      <ToolGrid activeTool={generic ? undefined : tool.id} />
    </div>
  );
}
