import { createFileRoute } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { useMemo, useState } from "react";
import { ToolHint, ToolOptionsHeader, ToolPageShell } from "@/components/layout/tool-page-shell";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
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
    <ToolPageShell
      tag="OCR"
      title="OCR a PDF"
      description="Make scans searchable and selectable. We detect text, deskew pages, and embed a hidden text layer."
      icon={ScanLine}
      workspace={
        <>
          <FileDropzone
            onFile={setFile}
            selectedFile={file}
            onClear={() => setFile(null)}
            disabled={submitting}
          />
          {file ? <PageThumbnails file={file} /> : null}
        </>
      }
      options={
        <>
          <ToolOptionsHeader
            title="Language"
            hint="Pick the dominant language for best accuracy."
          />
          <FormField id="language" label="Detect language">
            <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </FormField>
          <Button size="lg" onClick={onSubmit} disabled={!file || submitting} className="h-11">
            <ScanLine className="mr-2 h-4 w-4" />
            {submitting ? "Starting…" : "Run OCR"}
          </Button>
          <ToolHint>
            Note: OCR requires Tesseract on the server. If your instance returns{" "}
            <code>ocr_not_configured</code>, ask your operator to install ocrmypdf + tesseract.
          </ToolHint>
        </>
      }
      active={
        sortedIds.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedIds.map((id) => (
              <ToolJobCard key={id} clientUploadId={id} successLabel="OCR complete" />
            ))}
          </div>
        ) : null
      }
    />
  );
}
