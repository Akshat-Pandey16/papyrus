import { createFileRoute } from "@tanstack/react-router";
import { Split } from "lucide-react";
import { useMemo, useState } from "react";
import { AnonymousBanner } from "@/components/shared/anonymous-banner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useCreateSplitJobMutation } from "@/features/pdf-tools/api";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ToolJobCard } from "@/features/pdf-tools/tool-job-card";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";

export const Route = createFileRoute("/tools/split")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: SplitPage,
});

function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [ranges, setRanges] = useState("1-2,3-4");
  const createJob = useCreateSplitJobMutation();
  const { run, submitting } = useSingleFileJobRunner();
  const uploadsMap = useUploadStore((s) => s.uploads);

  const sortedIds = useMemo(
    () =>
      Object.values(uploadsMap)
        .filter((e) => e.kind === "split")
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => e.clientUploadId),
    [uploadsMap],
  );

  const onSubmit = async () => {
    if (!file) return;
    await run({
      file,
      kind: "split",
      createJob: async (documentId, idempotencyKey) => {
        const job = await createJob.mutateAsync({ documentId, ranges, idempotencyKey });
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
            Pull out specific page ranges and download them as a ZIP. Example:{" "}
            <code className="rounded bg-foreground/5 px-1.5 py-0.5">1-3,5,7-9</code> produces three
            PDFs.
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
              <h2 className="text-sm font-semibold">Page ranges</h2>
              <p className="text-xs text-muted-foreground">
                Use commas to separate; dashes for ranges.
              </p>
            </div>
            <FormField id="ranges" label="Ranges">
              <Input
                id="ranges"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
                placeholder="1-3,5,7-9"
              />
            </FormField>
            <Button
              size="lg"
              onClick={onSubmit}
              disabled={!file || submitting || !ranges.trim()}
              className="h-11"
            >
              <Split className="mr-2 h-4 w-4" />
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
