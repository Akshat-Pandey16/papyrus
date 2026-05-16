import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, RotateCw, Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { ToolOptionsHeader, ToolPageShell } from "@/components/layout/tool-page-shell";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useCreateRotateJobMutation } from "@/features/pdf-tools/api";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ToolJobCard } from "@/features/pdf-tools/tool-job-card";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";

export const Route = createFileRoute("/tools/rotate")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: RotatePage,
});

function RotatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const { pageCount } = useFilePageCount(file);
  const create = useCreateRotateJobMutation();
  const { run, submitting } = useSingleFileJobRunner();
  const uploadsMap = useUploadStore((s) => s.uploads);

  const sortedIds = useMemo(
    () =>
      Object.values(uploadsMap)
        .filter((e) => e.kind === "rotate")
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => e.clientUploadId),
    [uploadsMap],
  );

  const cyclePage = (page: number) => {
    setRotations((prev) => {
      const next = { ...prev };
      const current = next[page] ?? 0;
      const nextDeg = current === 0 ? 90 : current === 90 ? 180 : current === 180 ? 270 : 0;
      if (nextDeg === 0) {
        delete next[page];
      } else {
        next[page] = nextDeg;
      }
      return next;
    });
  };

  const applyToAll = (deg: 90 | 180 | 270) => {
    if (!pageCount) return;
    const next: Record<number, number> = {};
    for (let p = 1; p <= pageCount; p++) next[p] = deg;
    setRotations(next);
  };

  const clearRotations = () => setRotations({});

  const onSubmit = async () => {
    if (!file || Object.keys(rotations).length === 0) return;
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(rotations)) payload[k] = v;
    await run({
      file,
      kind: "rotate",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          rotations: payload,
          idempotencyKey,
        });
        return { id: job.id };
      },
    });
    setFile(null);
    setRotations({});
  };

  const hint =
    Object.keys(rotations).length === 0
      ? pageCount
        ? `${pageCount} page${pageCount === 1 ? "" : "s"} in this PDF.`
        : "Click any page on the left to rotate it."
      : `${Object.keys(rotations).length} of ${pageCount ?? "?"} page(s) will be rotated.`;

  return (
    <ToolPageShell
      tag="Rotate"
      title="Rotate pages"
      description="Click a page to rotate it 90° at a time, or apply to all. Untouched pages stay as-is."
      icon={Shuffle}
      workspace={
        <>
          <FileDropzone
            onFile={(f) => {
              setFile(f);
              setRotations({});
            }}
            selectedFile={file}
            onClear={() => {
              setFile(null);
              setRotations({});
            }}
            disabled={submitting}
          />
          {file ? (
            <PageThumbnails
              file={file}
              onPageClick={cyclePage}
              rotations={rotations}
              maxPages={pageCount ?? 200}
            />
          ) : null}
        </>
      }
      options={
        <>
          <ToolOptionsHeader title="Rotation plan" hint={hint} />

          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Apply to all pages
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyToAll(90)}
                disabled={!pageCount || submitting}
                className="h-9"
              >
                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> 90°
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyToAll(180)}
                disabled={!pageCount || submitting}
                className="h-9"
              >
                180°
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyToAll(270)}
                disabled={!pageCount || submitting}
                className="h-9"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 270°
              </Button>
            </div>
            {Object.keys(rotations).length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearRotations}
                disabled={submitting}
                className="h-8 self-start text-muted-foreground hover:text-foreground"
              >
                Clear all
              </Button>
            ) : null}
          </div>

          {Object.keys(rotations).length > 0 ? (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-background p-2 text-xs">
              {Object.entries(rotations)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([page, deg]) => (
                  <li key={page} className="flex items-center justify-between gap-3">
                    <span>Page {page}</span>
                    <span className="font-medium">{deg}°</span>
                  </li>
                ))}
            </ul>
          ) : null}
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={!file || submitting || Object.keys(rotations).length === 0}
            className="h-11"
          >
            <RotateCw className="mr-2 h-4 w-4" />
            {submitting ? "Starting…" : "Rotate pages"}
          </Button>
        </>
      }
      active={
        sortedIds.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedIds.map((id) => (
              <ToolJobCard key={id} clientUploadId={id} successLabel="Rotation complete" />
            ))}
          </div>
        ) : null
      }
    />
  );
}
