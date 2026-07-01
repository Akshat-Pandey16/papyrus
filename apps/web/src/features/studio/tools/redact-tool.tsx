import { SquareDashedBottom } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type OverlayOp, useCreateRedactJobMutation } from "@/features/pdf-tools/api";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { OverlayEditor } from "@/features/studio/overlay-editor";
import { CanvasHeader } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function RedactTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const [ops, setOps] = useState<OverlayOp[]>([]);
  const create = useCreateRedactJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const rects = ops.filter((o) => o.type === "rect");
  const canRun = rects.length > 0 && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const redactions = rects.map((o) => ({
      page: o.page,
      x: Number(o.x),
      y: Number(o.y),
      w: Number(o.w),
      h: Number(o.h),
    }));
    const result = await run({
      file,
      kind: "redact",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, redactions, dpi: 200, idempotencyKey });
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
          <OverlayEditor file={file} mode="redact" onOpsChange={setOps} />
        </div>
      }
      inspector={
        <InspectorFrame
          toolId="redact"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={!canRun}
              className="w-full"
            >
              {submitting
                ? "Starting…"
                : `Redact ${rects.length || ""} area${rects.length === 1 ? "" : "s"}`.trim()}
            </Button>
          }
        >
          <InspectorSection label="True redaction" hint="This permanently destroys the content.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Drag boxes over anything sensitive. Redacted pages are flattened to an image so the
              underlying text and data are <span className="font-medium text-foreground">gone</span>{" "}
              — not just hidden behind a black rectangle.
            </p>
          </InspectorSection>
          <InspectorSection label="Marked">
            <div className="flex items-center gap-2">
              <SquareDashedBottom className="size-4 text-primary" />
              <span className="text-sm">
                {rects.length} area{rects.length === 1 ? "" : "s"} across this document
              </span>
            </div>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
