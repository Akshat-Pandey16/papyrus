import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Select } from "@/components/ui/select";
import { CompressionLevelSelector } from "@/features/pdf-compress/components/compression-level-selector";
import { CompressionOptionsPanel } from "@/features/pdf-compress/components/compression-options-panel";
import { DEFAULT_LEVEL, detectLevel, optionsForLevel } from "@/features/pdf-compress/presets";
import type { CompressionLevel, CompressionOptions } from "@/features/pdf-compress/types";
import type { SplitMode, SplitOptions } from "@/features/pdf-tools/api";
import { cn } from "@/lib/utils";

export type SplitOptionsPanelProps = {
  value: SplitOptions;
  onChange: (next: SplitOptions) => void;
  mode: SplitMode;
  disabled?: boolean | undefined;
};

export function SplitOptionsPanel({
  value,
  onChange,
  mode,
  disabled = false,
}: SplitOptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const patch = (delta: Partial<SplitOptions>) => onChange({ ...value, ...delta });

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-background/40"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <div className="flex flex-col gap-0.5">
          <span id={headingId} className="text-sm font-medium">
            Advanced options
          </span>
          <span className="text-[11px] text-muted-foreground">
            Combine, hygiene, and post-split compression.
          </span>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          {mode === "ranges" ? (
            <CombineSection value={value} patch={patch} disabled={disabled} />
          ) : null}
          <HygieneSection value={value} patch={patch} disabled={disabled} />
          <CompressSection value={value} patch={patch} disabled={disabled} />
        </div>
      ) : null}
    </section>
  );
}

type SectionProps = {
  value: SplitOptions;
  patch: (delta: Partial<SplitOptions>) => void;
  disabled: boolean;
};

function CombineSection({ value, patch, disabled }: SectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Output</SectionLabel>
      <Toggle
        label="Combine selected ranges into one PDF"
        hint="When off, each range is a separate PDF inside a ZIP."
        checked={value.combineIntoSingle}
        onChange={(v) => patch({ combineIntoSingle: v })}
        disabled={disabled}
      />
    </div>
  );
}

function HygieneSection({ value, patch, disabled }: SectionProps) {
  const versionId = useId();
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Output hygiene</SectionLabel>
      <Toggle
        label="Strip metadata"
        hint="Drop title, author, producer, and XMP."
        checked={value.stripMetadata}
        onChange={(v) => patch({ stripMetadata: v })}
        disabled={disabled}
      />
      <Toggle
        label="Linearize for fast web view"
        hint="Optimized for streaming page-by-page."
        checked={value.linearize}
        onChange={(v) => patch({ linearize: v })}
        disabled={disabled}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={versionId} className="text-xs font-medium">
          Normalize PDF version
        </label>
        <Select
          id={versionId}
          size="sm"
          value={value.pdfVersion ?? "auto"}
          disabled={disabled}
          onChange={(e) =>
            patch({
              pdfVersion:
                e.target.value === "auto"
                  ? null
                  : (e.target.value as "1.4" | "1.5" | "1.6" | "1.7"),
            })
          }
        >
          <option value="auto">Auto (preserve original version)</option>
          <option value="1.4">PDF 1.4</option>
          <option value="1.5">PDF 1.5</option>
          <option value="1.6">PDF 1.6</option>
          <option value="1.7">PDF 1.7</option>
        </Select>
      </div>
    </div>
  );
}

function CompressSection({ value, patch, disabled }: SectionProps) {
  const enabled = value.compress !== null;
  const [compressLevel, setCompressLevel] = useState<CompressionLevel>(DEFAULT_LEVEL);
  const compressOptions = value.compress ?? optionsForLevel(DEFAULT_LEVEL);

  const setEnabled = (next: boolean) => {
    if (next) patch({ compress: optionsForLevel(compressLevel) });
    else patch({ compress: null });
  };
  const setLevel = (next: CompressionLevel) => {
    setCompressLevel(next);
    if (next !== "custom") patch({ compress: optionsForLevel(next) });
  };
  const setOptions = (next: CompressionOptions) => {
    patch({ compress: next });
    setCompressLevel(detectLevel(next));
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Compress while splitting</SectionLabel>
      <Toggle
        label="Run compression on each output"
        hint="Adds a few seconds. Full compress options apply when enabled."
        checked={enabled}
        onChange={setEnabled}
        disabled={disabled}
      />
      {enabled ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-3">
          <CompressionLevelSelector value={compressLevel} onChange={setLevel} disabled={disabled} />
          <CompressionOptionsPanel
            value={compressOptions}
            onChange={setOptions}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

type ToggleProps = {
  label: string;
  hint?: string | undefined;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean | undefined;
};

function Toggle({ label, hint, checked, onChange, disabled }: ToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-background p-2.5 transition-colors",
        checked ? "border-foreground/30" : "hover:border-foreground/20",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-foreground"
      />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium leading-tight">{label}</span>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
    </label>
  );
}
