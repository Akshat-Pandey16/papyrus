import { PencilLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type OverlayOp, useCreateEditJobMutation } from "@/features/pdf-tools/api";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { OverlayEditor } from "@/features/studio/overlay-editor";
import { CanvasHeader } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function EditTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const [ops, setOps] = useState<OverlayOp[]>([]);
  const create = useCreateEditJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const canRun = ops.length > 0 && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const result = await run({
      file,
      kind: "edit",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, ops, idempotencyKey });
        return { id: job.id };
      },
    });
    if (result) onLaunched();
  };

  return (
    <StudioLayout
      canvas={
        <div className="flex flex-col gap-4">
          <CanvasHeader
            file={file}
            pageCount={null}
            onReplaceFile={onReplaceFile}
            onRemove={onRemove}
          />
          <OverlayEditor file={file} mode="edit" onOpsChange={setOps} />
        </div>
      }
      inspector={
        <InspectorFrame
          toolId="edit"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={!canRun}
              className="w-full"
            >
              {submitting ? <Spinner /> : <PencilLine />}
              {submitting ? "Starting…" : "Apply edits"}
            </Button>
          }
        >
          <InspectorSection
            label="Mark up the page"
            hint="Add on top of the original — non-destructive."
          >
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Text</span> to add notes,{" "}
              <span className="font-medium text-foreground">Draw</span> to annotate freehand, and{" "}
              <span className="font-medium text-foreground">Box</span> to white-out content you want
              to cover.
            </p>
          </InspectorSection>
          <InspectorSection label="Edits">
            <span className="text-sm">
              {ops.length} change{ops.length === 1 ? "" : "s"} ready
            </span>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
