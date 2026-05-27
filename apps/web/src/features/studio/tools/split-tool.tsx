import { Scissors } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type PageRange, PageRangeBuilder } from "@/components/shared/page-range-builder";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  type SplitMode,
  type SplitOptions,
  useCreateSplitJobMutation,
} from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

const DEFAULT_OPTIONS: SplitOptions = {
  combineIntoSingle: false,
  stripMetadata: false,
  linearize: false,
  pdfVersion: null,
  compress: null,
};

export function SplitTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [mode, setMode] = useState<SplitMode>("ranges");
  const [ranges, setRanges] = useState<PageRange[]>([{ from: 1, to: 1 }]);
  const [everyN, setEveryN] = useState(2);
  const [options, setOptions] = useState<SplitOptions>(DEFAULT_OPTIONS);
  const create = useCreateSplitJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed ranges when the file/page count changes
  useEffect(() => {
    if (pageCount != null) {
      setRanges([{ from: 1, to: pageCount }]);
      setEveryN((prev) => Math.min(Math.max(1, prev), pageCount));
    }
  }, [file, pageCount]);

  const highlighted = useMemo(() => {
    if (mode !== "ranges") return undefined;
    const set = new Set<number>();
    for (const r of ranges) for (let p = r.from; p <= r.to; p++) set.add(p);
    return set;
  }, [mode, ranges]);

  const outputPreview = useMemo(() => {
    if (pageCount == null) return null;
    if (mode === "ranges") {
      const pages = ranges.reduce((sum, r) => sum + Math.max(0, r.to - r.from + 1), 0);
      if (options.combineIntoSingle) return `1 PDF · ${pages} page${pages === 1 ? "" : "s"}`;
      return `${ranges.length} PDF${ranges.length === 1 ? "" : "s"} in a ZIP · ${pages} pages`;
    }
    if (mode === "every_n") {
      const parts = Math.ceil(pageCount / Math.max(1, everyN));
      return `${parts} PDF${parts === 1 ? "" : "s"} in a ZIP · ${everyN} pages each`;
    }
    return `${pageCount} single-page PDFs in a ZIP`;
  }, [mode, ranges, everyN, pageCount, options.combineIntoSingle]);

  const ready =
    !submitting &&
    pageCount != null &&
    pageCount >= 1 &&
    (mode !== "ranges" || ranges.every((r) => r.from <= r.to && r.to <= pageCount));

  const onRun = async () => {
    if (!ready) return;
    const result = await run({
      file,
      kind: "split",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          mode,
          idempotencyKey,
          options,
          ...(mode === "ranges" ? { ranges } : {}),
          ...(mode === "every_n" ? { everyN } : {}),
        });
        return { id: job.id };
      },
    });
    if (result) onLaunched();
  };

  return (
    <StudioLayout
      canvas={
        <StageCanvas
          file={file}
          pageCount={pageCount}
          onReplaceFile={onReplaceFile}
          onRemove={onRemove}
          maxPages={pageCount ?? 60}
          highlightedPages={highlighted}
          instruction={
            mode === "ranges"
              ? "Highlighted pages are included in your ranges below."
              : "Set how to slice the document in the panel."
          }
        />
      }
      inspector={
        <InspectorFrame
          toolId="split"
          footer={
            <Button variant="molten" size="lg" onClick={onRun} disabled={!ready} className="w-full">
              {submitting ? <Spinner /> : <Scissors />}
              {submitting ? "Starting…" : "Split PDF"}
            </Button>
          }
        >
          <InspectorSection label="Split mode">
            <Segmented<SplitMode>
              value={mode}
              onChange={setMode}
              ariaLabel="Split mode"
              options={[
                { value: "ranges", label: "Ranges" },
                { value: "every_n", label: "Every N" },
                { value: "single_pages", label: "Each page" },
              ]}
            />
          </InspectorSection>

          {mode === "ranges" ? (
            <InspectorSection label="Page ranges">
              <PageRangeBuilder
                pageCount={pageCount}
                ranges={ranges}
                onChange={setRanges}
                disabled={submitting}
                compact
              />
              <label
                htmlFor="combine-single"
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3"
              >
                <span className="text-xs">
                  <span className="font-medium">Combine into one PDF</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Otherwise you get a ZIP of separate files
                  </span>
                </span>
                <Switch
                  id="combine-single"
                  checked={options.combineIntoSingle}
                  onCheckedChange={(v) => setOptions((o) => ({ ...o, combineIntoSingle: v }))}
                />
              </label>
            </InspectorSection>
          ) : null}

          {mode === "every_n" ? (
            <InspectorSection label="Pages per file">
              <NumberInput
                value={everyN}
                onChange={setEveryN}
                min={1}
                max={pageCount ?? 10000}
                disabled={submitting || pageCount == null}
                ariaLabel="Pages per file"
              />
            </InspectorSection>
          ) : null}

          {outputPreview ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs">
              <span className="font-medium text-foreground">You'll get:</span>{" "}
              <span className="text-muted-foreground">{outputPreview}</span>
            </div>
          ) : null}
        </InspectorFrame>
      }
    />
  );
}
