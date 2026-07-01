import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateExtractTextJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function ExtractTextTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const create = useCreateExtractTextJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "extract_text",
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
          instruction="Pull the text out of a PDF into a plain .txt file you can copy, search, or reuse."
        />
      }
      inspector={
        <InspectorFrame
          toolId="extract_text"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <FileText />}
              {submitting ? "Starting…" : "Extract text"}
            </Button>
          }
        >
          <InspectorSection label="Plain text out" hint="Every page's text into one .txt file.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              We read the text layer of your PDF and save it as UTF-8 plain text, page by page. If
              your file is a scan or an image with no text layer, run OCR first — there's nothing to
              extract from pixels alone.
            </p>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
