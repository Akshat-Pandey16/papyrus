import { Code2, Timer, Zap } from "lucide-react";
import { Dropzone } from "@/features/studio/dropzone";
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
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-4 py-10 text-center sm:py-14">
      <div className="flex flex-col items-center gap-4">
        <span className="inline-flex items-center rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          {generic ? `${TOOL_ORDER.length} tools · no sign-up` : tool.label}
        </span>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {generic ? (
            "Every PDF task, one quiet drop."
          ) : (
            <>
              <span className="text-primary">{tool.verb}</span> {noun}.
            </>
          )}
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          {generic
            ? "Drop a file and it just works — no account, nothing to wrangle, nothing left behind."
            : `${tool.tagline}. No account, nothing kept.`}
        </p>
      </div>

      <Dropzone
        onFiles={onFiles}
        multi={multi}
        accept={accept}
        variant="full"
        showHeading={false}
        className="w-full"
      />

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {TRUST.map((t) => (
          <span key={t.label} className="inline-flex items-center gap-1.5">
            <t.icon className="size-4 text-primary/80" strokeWidth={2.2} />
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
