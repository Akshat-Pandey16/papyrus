import { Sparkles } from "lucide-react";
import { formatBytes, formatPercent } from "@/features/pdf-compress/format";
import type { CompressEstimate } from "@/features/pdf-compress/types";

export function EstimateResult({ estimate }: { estimate: CompressEstimate }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span className="text-xs font-semibold">Projected after compression</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Cell label="Original" value={formatBytes(estimate.inputSizeBytes)} />
        <Cell label="Projected" value={formatBytes(estimate.projectedOutputSizeBytes)} />
        <Cell
          label="Saved"
          value={formatPercent(estimate.projectedRatio)}
          accent="text-emerald-600 dark:text-emerald-400"
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Estimated by compressing {estimate.samplePageCount} of {estimate.totalPageCount} pages
        {estimate.engine === "ghostscript" && estimate.gsVersion
          ? ` · Ghostscript ${estimate.gsVersion}`
          : ""}{" "}
        · {estimate.elapsedMs} ms
      </p>
    </div>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${accent ?? ""}`}>{value}</span>
    </div>
  );
}
