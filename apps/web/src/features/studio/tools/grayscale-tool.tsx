import { Contrast } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateGrayscaleJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function GrayscaleTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const create = useCreateGrayscaleJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "grayscale",
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
          instruction="Convert every page to grayscale — great for printing and shrinking color-heavy scans."
        />
      }
      inspector={
        <InspectorFrame
          toolId="grayscale"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Contrast />}
              {submitting ? "Starting…" : "Grayscale PDF"}
            </Button>
          }
        >
          <InspectorSection label="Black & white" hint="Colors become shades of gray.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Every page is converted to grayscale. Text stays crisp, and color-heavy pages often
              get noticeably smaller — ideal for black-and-white printing.
            </p>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
