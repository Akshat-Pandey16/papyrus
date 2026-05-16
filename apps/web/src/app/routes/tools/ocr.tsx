import { createFileRoute } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { useMemo, useState } from "react";
import { AnonymousBanner } from "@/components/shared/anonymous-banner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useCreateOcrJobMutation } from "@/features/pdf-tools/api";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ToolJobCard } from "@/features/pdf-tools/tool-job-card";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";

const LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "spa", label: "Spanish" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "nld", label: "Dutch" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
  { code: "hin", label: "Hindi" },
  { code: "ara", label: "Arabic" },
];

export const Route = createFileRoute("/tools/ocr")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: OcrPage,
});

function OcrPage() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("eng");
  const create = useCreateOcrJobMutation();
  const { run, submitting } = useSingleFileJobRunner();
  const uploadsMap = useUploadStore((s) => s.uploads);

  const sortedIds = useMemo(
    () =>
      Object.values(uploadsMap)
        .filter((e) => e.kind === "ocr")
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => e.clientUploadId),
    [uploadsMap],
  );

  const onSubmit = async () => {
    if (!file) return;
    await run({
      file,
      kind: "ocr",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, language, idempotencyKey });
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
            Make scanned PDFs searchable and selectable. We&apos;ll detect text, deskew pages, and
            embed it as a hidden layer.
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
              <h2 className="text-sm font-semibold">Language</h2>
              <p className="text-xs text-muted-foreground">
                Pick the dominant language for best accuracy.
              </p>
            </div>
            <FormField id="language" label="Detect language">
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </FormField>
            <Button size="lg" onClick={onSubmit} disabled={!file || submitting} className="h-11">
              <ScanLine className="mr-2 h-4 w-4" />
              {submitting ? "Starting…" : "Run OCR"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Note: OCR requires Tesseract on the server. If your instance returns{" "}
              <code>ocr_not_configured</code>, ask your operator to install ocrmypdf + tesseract.
            </p>
          </aside>
        </section>

        {sortedIds.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Active</h2>
            <div className="flex flex-col gap-3">
              {sortedIds.map((id) => (
                <ToolJobCard key={id} clientUploadId={id} successLabel="OCR complete" />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
