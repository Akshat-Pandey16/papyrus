import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreatePdfToPowerpointJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function PdfToPowerpointTool({
  file,
  onReplaceFile,
  onRemove,
  onLaunched,
}: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const create = useCreatePdfToPowerpointJobMutation();
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
          instruction="Turn each page of your PDF into a slide you can open and edit in PowerPoint."
        />
      }
      inspector={
        <InspectorFrame
          toolId="pdf_to_powerpoint"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Presentation />}
              {submitting ? "Starting…" : "Convert to PowerPoint"}
            </Button>
          }
        >
          <InspectorSection label="PDF to slides" hint="One slide per page, as a .pptx file.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              We turn every page into a PowerPoint slide. Simple, text-based PDFs come through the
              most editable; complex layouts and scans may land on the slide as an image. Open the
              result in PowerPoint, Keynote, or Google Slides.
            </p>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
