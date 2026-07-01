import { SquareStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateFlattenJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function FlattenTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const create = useCreateFlattenJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "flatten",
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
          instruction="Bake form fields, annotations, and stamps into the page so they can't be changed."
        />
      }
      inspector={
        <InspectorFrame
          toolId="flatten"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <SquareStack />}
              {submitting ? "Starting…" : "Flatten PDF"}
            </Button>
          }
        >
          <InspectorSection label="Make it permanent" hint="Interactive layers become static.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Filled form fields, comments, highlights, and signatures get merged into the page
              itself. The result looks identical but can no longer be edited or un-filled — ideal
              before sharing a final copy. This can't be undone, so keep your original.
            </p>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
