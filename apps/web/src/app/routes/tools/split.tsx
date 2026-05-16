import { createFileRoute } from "@tanstack/react-router";
import { Split } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AnonymousBanner } from "@/components/shared/anonymous-banner";
import { type PageRange, PageRangeBuilder } from "@/components/shared/page-range-builder";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { useUploadStore } from "@/features/pdf-compress/store";
import {
  type SplitMode,
  type SplitOptions,
  useCreateSplitJobMutation,
} from "@/features/pdf-tools/api";
import { SplitModeSelector } from "@/features/pdf-tools/components/split-mode-selector";
import { SplitOptionsPanel } from "@/features/pdf-tools/components/split-options-panel";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ToolJobCard } from "@/features/pdf-tools/tool-job-card";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";

export const Route = createFileRoute("/tools/split")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: SplitPage,
});

const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  combineIntoSingle: false,
  stripMetadata: false,
  linearize: false,
  pdfVersion: null,
  compress: null,
};

function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SplitMode>("ranges");
  const [ranges, setRanges] = useState<PageRange[]>([{ from: 1, to: 1 }]);
  const [everyN, setEveryN] = useState(2);
  const [options, setOptions] = useState<SplitOptions>(DEFAULT_SPLIT_OPTIONS);

  const { pageCount, loading: pageCountLoading, error: pageCountError } = useFilePageCount(file);
  const createJob = useCreateSplitJobMutation();
  const { run, submitting } = useSingleFileJobRunner();
  const uploadsMap = useUploadStore((s) => s.uploads);

  useEffect(() => {
    if (!file) {
      setRanges([{ from: 1, to: 1 }]);
      setEveryN(2);
      return;
    }
    if (pageCount != null) {
      setRanges([{ from: 1, to: pageCount }]);
      setEveryN((prev) => Math.min(Math.max(1, prev), pageCount));
    }
  }, [file, pageCount]);

  const sortedIds = useMemo(
    () =>
      Object.values(uploadsMap)
        .filter((e) => e.kind === "split")
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => e.clientUploadId),
    [uploadsMap],
  );

  const outputPreview = useMemo(() => {
    if (pageCount == null) return null;
    if (mode === "ranges") {
      const pages = ranges.reduce((sum, r) => sum + Math.max(0, r.to - r.from + 1), 0);
      if (options.combineIntoSingle) {
        return `1 PDF with ${pages} page${pages === 1 ? "" : "s"}`;
      }
      return `${ranges.length} PDF${ranges.length === 1 ? "" : "s"} in a ZIP · ${pages} total pages`;
    }
    if (mode === "every_n") {
      const parts = Math.ceil(pageCount / Math.max(1, everyN));
      return `${parts} PDF${parts === 1 ? "" : "s"} in a ZIP · ${everyN} page${
        everyN === 1 ? "" : "s"
      } each`;
    }
    return `${pageCount} PDF${pageCount === 1 ? "" : "s"} in a ZIP · 1 page each`;
  }, [mode, ranges, everyN, pageCount, options.combineIntoSingle]);

  const ready =
    !!file &&
    !submitting &&
    pageCount != null &&
    pageCount >= 1 &&
    (mode !== "ranges" || ranges.every((r) => r.from <= r.to && r.to <= pageCount));

  const onSubmit = async () => {
    if (!file || !ready) return;
    await run({
      file,
      kind: "split",
      createJob: async (documentId, idempotencyKey) => {
        const job = await createJob.mutateAsync({
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
    setFile(null);
  };

  return (
    <div className="w-full px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <AnonymousBanner />
        <header className="flex flex-col gap-2">
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]">
            Pick how you want to split, point to the pages, and we&apos;ll do the rest. Files are
            deleted after 24 hours.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-4">
            <FileDropzone
              onFile={setFile}
              selectedFile={file}
              onClear={() => setFile(null)}
              disabled={submitting}
            />
            {file ? <PageThumbnails file={file} /> : null}
          </div>

          <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold">Split options</h2>
              <p className="text-xs text-muted-foreground">
                {pageCountLoading
                  ? "Reading file…"
                  : pageCountError
                    ? "We couldn't read the page count — try another file."
                    : pageCount != null
                      ? `${pageCount} page${pageCount === 1 ? "" : "s"} in this PDF.`
                      : "Drop a PDF to begin."}
              </p>
            </div>

            <SplitModeSelector value={mode} onChange={setMode} disabled={submitting} />

            {mode === "ranges" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium">Ranges</p>
                <PageRangeBuilder
                  pageCount={pageCount}
                  ranges={ranges}
                  onChange={setRanges}
                  disabled={submitting}
                />
              </div>
            ) : null}

            {mode === "every_n" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium">Pages per file</p>
                <NumberInput
                  value={everyN}
                  onChange={setEveryN}
                  min={1}
                  max={pageCount ?? 10_000}
                  disabled={submitting || pageCount == null}
                  ariaLabel="Pages per file"
                />
              </div>
            ) : null}

            <SplitOptionsPanel
              value={options}
              onChange={setOptions}
              mode={mode}
              disabled={submitting}
            />

            {outputPreview ? (
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Output:</span> {outputPreview}
              </div>
            ) : null}

            <Button size="lg" onClick={onSubmit} disabled={!ready} className="h-11">
              <Split className="mr-2 h-4 w-4" aria-hidden />
              {submitting ? "Starting…" : "Split PDF"}
            </Button>
          </aside>
        </section>

        {sortedIds.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Active</h2>
            <div className="flex flex-col gap-3">
              {sortedIds.map((id) => (
                <ToolJobCard key={id} clientUploadId={id} successLabel="Split complete" />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
