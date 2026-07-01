import { FileOutput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreatePdfToWordJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function PdfToWordTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const create = useCreatePdfToWordJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "convert",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, idempotencyKey });
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
          instruction="Turn this PDF into an editable Word document — text, layout, and images come across."
        />
      }
      inspector={
        <InspectorFrame
          toolId="pdf_to_word"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <FileOutput />}
              {submitting ? "Starting…" : "Convert to Word"}
            </Button>
          }
        >
          <InspectorSection
            label="Editable .docx"
            hint="Opens in Word, Google Docs, or LibreOffice."
          >
            <p className="text-xs leading-relaxed text-muted-foreground">
              We rebuild your PDF as a Word document you can edit. Text-based PDFs convert best.
            </p>
          </InspectorSection>
          <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Scanned or image-only PDFs have no selectable text — run{" "}
            <span className="font-medium text-foreground">OCR</span> first so the words come
            through.
          </p>
        </InspectorFrame>
      }
    />
  );
}
