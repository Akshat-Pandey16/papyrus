import { createFileRoute } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { AnonymousBanner } from "@/components/shared/anonymous-banner";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useCreateRotateJobMutation } from "@/features/pdf-tools/api";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ToolJobCard } from "@/features/pdf-tools/tool-job-card";
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

  return (
    <div className="w-full px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <AnonymousBanner />
        <header className="flex flex-col gap-2">
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]">
            Click a page to rotate it 90° at a time. Unchanged pages stay as-is.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-4">
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
                maxPages={50}
              />
            ) : null}
          </div>

          <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold">Rotation plan</h2>
              <p className="text-xs text-muted-foreground">
                {Object.keys(rotations).length === 0
                  ? "Click any page on the left to rotate it."
                  : `${Object.keys(rotations).length} page(s) will be rotated.`}
              </p>
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
          </aside>
        </section>

        {sortedIds.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Active</h2>
            <div className="flex flex-col gap-3">
              {sortedIds.map((id) => (
                <ToolJobCard key={id} clientUploadId={id} successLabel="Rotation complete" />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
