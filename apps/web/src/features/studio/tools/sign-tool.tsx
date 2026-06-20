import { Signature } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type OverlayOp, useCreateSignJobMutation } from "@/features/pdf-tools/api";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { OverlayEditor } from "@/features/studio/overlay-editor";
import { CanvasHeader } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function SignTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const [ops, setOps] = useState<OverlayOp[]>([]);
  const create = useCreateSignJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const canRun = ops.length > 0 && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const result = await run({
      file,
      kind: "sign",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, placements: ops, idempotencyKey });
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
          <OverlayEditor file={file} mode="sign" onOpsChange={setOps} />
        </div>
      }
      inspector={
        <InspectorFrame
          toolId="sign"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={!canRun}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Signature />}
              {submitting ? "Starting…" : "Apply signature"}
            </Button>
          }
        >
          <InspectorSection
            label="Sign it your way"
            hint="Everything stays on your machine until you submit."
          >
            <p className="text-xs leading-relaxed text-muted-foreground">
              Use <span className="font-medium text-foreground">Draw</span> to sign with your mouse
              or finger, or <span className="font-medium text-foreground">Text</span> to type your
              name and the date. Place marks on any page.
            </p>
          </InspectorSection>
          <InspectorSection label="Placed">
            <span className="text-sm">
              {ops.length} mark{ops.length === 1 ? "" : "s"} ready
            </span>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
