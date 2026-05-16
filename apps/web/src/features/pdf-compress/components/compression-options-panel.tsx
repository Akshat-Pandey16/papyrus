import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Select } from "@/components/ui/select";
import type { CompressionOptions } from "@/features/pdf-compress/types";
import { cn } from "@/lib/utils";

export type CompressionOptionsPanelProps = {
  value: CompressionOptions;
  onChange: (next: CompressionOptions) => void;
  disabled?: boolean | undefined;
};

const DIMENSION_OPTIONS: ReadonlyArray<{ label: string; value: number | null }> = [
  { label: "Original size", value: null },
  { label: "3000 px (print quality)", value: 3000 },
  { label: "2400 px (high)", value: 2400 },
  { label: "1600 px (web)", value: 1600 },
  { label: "1100 px (screen)", value: 1100 },
  { label: "800 px (thumbnail)", value: 800 },
];

export function CompressionOptionsPanel({
  value,
  onChange,
  disabled = false,
}: CompressionOptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();

  const patch = (delta: Partial<CompressionOptions>) => onChange({ ...value, ...delta });

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
            Quality, downsampling, metadata, and more.
          </span>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <EngineSection value={value} onPatch={patch} disabled={disabled} />
          <ImageSection value={value} onPatch={patch} disabled={disabled} />
          <DiscardSection value={value} onPatch={patch} disabled={disabled} />
          <StructureSection value={value} onPatch={patch} disabled={disabled} />
        </div>
      ) : null}
    </section>
  );
}

function EngineSection({ value, onPatch, disabled }: SectionProps) {
  const engineId = useId();
  const versionId = useId();
  const isGs = value.engine === "ghostscript";
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Engine</SectionLabel>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={engineId} className="text-xs font-medium">
          Compression engine
        </label>
        <Select
          id={engineId}
          size="sm"
          value={value.engine}
          disabled={disabled}
          onChange={(e) =>
            onPatch({
              engine: e.target.value === "ghostscript" ? "ghostscript" : "pikepdf",
            })
          }
        >
          <option value="pikepdf">pikepdf — fast, per-image control</option>
          <option value="ghostscript">Ghostscript — best savings, font subsetting</option>
        </Select>
        <p className="text-[10px] leading-snug text-muted-foreground">
          {isGs
            ? "Auto-subsets fonts and uses CCITT/JBIG2 for mono images. Slower for tiny files."
            : "Pure-Python engine. Per-image quality control. No font subsetting."}
        </p>
      </div>
      <div className={cn("flex flex-col gap-1.5", !isGs && "pointer-events-none opacity-50")}>
        <label htmlFor={versionId} className="text-xs font-medium">
          Target PDF version
        </label>
        <Select
          id={versionId}
          size="sm"
          value={value.pdfVersion ?? "1.7"}
          disabled={disabled || !isGs}
          onChange={(e) => onPatch({ pdfVersion: e.target.value as "1.4" | "1.5" | "1.6" | "1.7" })}
        >
          <option value="1.4">PDF 1.4 (Acrobat 5+, most compatible)</option>
          <option value="1.5">PDF 1.5 (Acrobat 6+)</option>
          <option value="1.6">PDF 1.6 (Acrobat 7+)</option>
          <option value="1.7">PDF 1.7 (Acrobat 8+)</option>
        </Select>
      </div>
    </div>
  );
}

type SectionProps = {
  value: CompressionOptions;
  onPatch: (delta: Partial<CompressionOptions>) => void;
  disabled?: boolean | undefined;
};

function ImageSection({ value, onPatch, disabled }: SectionProps) {
  const qualityId = useId();
  const dimId = useId();
  const colorId = useId();

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Images</SectionLabel>

      <Toggle
        label="Recompress embedded images"
        hint="Re-encode images as JPEG."
        checked={value.recompressImages}
        onChange={(v) => onPatch({ recompressImages: v })}
        disabled={disabled}
      />

      <div
        className={cn(
          "flex flex-col gap-3",
          !value.recompressImages && "pointer-events-none opacity-50",
        )}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={qualityId} className="flex items-center justify-between text-xs">
            <span className="font-medium">Image quality</span>
            <span className="tabular-nums text-muted-foreground">{value.imageQuality}</span>
          </label>
          <input
            id={qualityId}
            type="range"
            min={1}
            max={100}
            step={1}
            value={value.imageQuality}
            disabled={disabled || !value.recompressImages}
            onChange={(e) => onPatch({ imageQuality: Number(e.target.value) })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-foreground"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Smallest</span>
            <span>Highest quality</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={dimId} className="text-xs font-medium">
            Max image dimension
          </label>
          <Select
            id={dimId}
            size="sm"
            value={value.imageMaxDimension ?? "null"}
            disabled={disabled || !value.recompressImages}
            onChange={(e) =>
              onPatch({
                imageMaxDimension: e.target.value === "null" ? null : Number(e.target.value),
              })
            }
          >
            {DIMENSION_OPTIONS.map((d) => (
              <option key={d.label} value={d.value ?? "null"}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={colorId} className="text-xs font-medium">
            Color
          </label>
          <Select
            id={colorId}
            size="sm"
            value={value.colorMode}
            disabled={disabled || !value.recompressImages}
            onChange={(e) =>
              onPatch({
                colorMode: e.target.value === "grayscale" ? "grayscale" : "preserve",
              })
            }
          >
            <option value="preserve">Keep original</option>
            <option value="grayscale">Convert to grayscale</option>
          </Select>
        </div>
      </div>
    </div>
  );
}

function DiscardSection({ value, onPatch, disabled }: SectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Discard objects</SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle
          label="Bookmarks"
          checked={value.discardBookmarks}
          onChange={(v) => onPatch({ discardBookmarks: v })}
          disabled={disabled}
        />
        <Toggle
          label="Annotations"
          checked={value.discardAnnotations}
          onChange={(v) => onPatch({ discardAnnotations: v })}
          disabled={disabled}
        />
        <Toggle
          label="Form fields"
          checked={value.discardForms}
          onChange={(v) => onPatch({ discardForms: v })}
          disabled={disabled}
        />
        <Toggle
          label="JavaScript"
          checked={value.discardJavascript}
          onChange={(v) => onPatch({ discardJavascript: v })}
          disabled={disabled}
        />
        <Toggle
          label="Attached files"
          checked={value.discardAttachments}
          onChange={(v) => onPatch({ discardAttachments: v })}
          disabled={disabled}
        />
        <Toggle
          label="Page thumbnails"
          checked={value.discardThumbnails}
          onChange={(v) => onPatch({ discardThumbnails: v })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function StructureSection({ value, onPatch, disabled }: SectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Structure</SectionLabel>
      <Toggle
        label="Strip metadata"
        hint="Title, author, producer, XMP."
        checked={value.stripMetadata}
        onChange={(v) => onPatch({ stripMetadata: v })}
        disabled={disabled}
      />
      <Toggle
        label="Linearize for fast web view"
        hint="Optimized for streaming page-by-page."
        checked={value.linearize}
        onChange={(v) => onPatch({ linearize: v })}
        disabled={disabled}
      />
      <Toggle
        label="Recompress object streams"
        hint="Smaller, but a touch slower to save."
        checked={value.recompressStreams}
        onChange={(v) => onPatch({ recompressStreams: v })}
        disabled={disabled}
      />
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
