import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type Rgb = [number, number, number];

export const COLOR_SWATCHES: { label: string; value: Rgb; hex: string }[] = [
  { label: "Slate", value: [0.6, 0.6, 0.6], hex: "#999999" },
  { label: "Ink", value: [0.1, 0.1, 0.1], hex: "#1a1a1a" },
  { label: "Red", value: [0.8, 0.15, 0.15], hex: "#cc2626" },
  { label: "Blue", value: [0.15, 0.3, 0.8], hex: "#264ccc" },
  { label: "Green", value: [0.15, 0.5, 0.2], hex: "#268033" },
];

export const FONT_OPTIONS = [
  { value: "Helvetica", label: "Helvetica" },
  { value: "Helvetica-Bold", label: "Helvetica Bold" },
  { value: "Times-Roman", label: "Times" },
  { value: "Times-Bold", label: "Times Bold" },
  { value: "Courier", label: "Courier" },
] as const;

export function rgbEquals(a: Rgb, b: Rgb): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  display,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  display: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          const next = v[0];
          if (typeof next === "number") onChange(next);
        }}
      />
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: Rgb; onChange: (next: Rgb) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_SWATCHES.map((swatch) => (
        <button
          key={swatch.label}
          type="button"
          aria-label={swatch.label}
          aria-pressed={rgbEquals(value, swatch.value)}
          onClick={() => onChange(swatch.value)}
          style={{ backgroundColor: swatch.hex }}
          className={cn(
            "size-7 rounded-full border-2 transition-transform hover:scale-110",
            rgbEquals(value, swatch.value)
              ? "border-foreground ring-2 ring-primary/40"
              : "border-border/60",
          )}
        />
      ))}
    </div>
  );
}
