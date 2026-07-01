import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateRepairJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function RepairTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const create = useCreateRepairJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "repair",
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
          instruction="Won't open elsewhere? We rebuild the PDF's structure to recover what's readable."
        />
      }
      inspector={
        <InspectorFrame
          toolId="repair"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Wrench />}
              {submitting ? "Starting…" : "Repair PDF"}
            </Button>
          }
        >
          <InspectorSection label="Recover a broken PDF" hint="Rebuilds the file's structure.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              If a PDF is truncated, corrupt, or throws errors in your reader, we reconstruct its
              internal structure so it opens again. A preview above may not load for a badly damaged
              file — that's expected; run the repair anyway.
            </p>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
