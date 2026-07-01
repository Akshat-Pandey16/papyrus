import { Crop } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateCropJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import { LabeledSlider } from "@/features/studio/tools/overlay-shared";
import type { SingleToolProps } from "@/features/studio/types";

export function CropTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  const [right, setRight] = useState(0);
  const [bottom, setBottom] = useState(0);
  const create = useCreateCropJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const w = (100 - left - right) / 100;
  const h = (100 - top - bottom) / 100;
  const valid = w > 0.05 && h > 0.05;
  const canRun = valid && (left > 0 || top > 0 || right > 0 || bottom > 0) && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const result = await run({
      file,
      kind: "crop",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          box: { x: left / 100, y: top / 100, w, h },
          idempotencyKey,
        });
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
          instruction="Trim a percentage off each edge. The same crop is applied to every page."
        />
      }
      inspector={
        <InspectorFrame
          toolId="crop"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={!canRun}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Crop />}
              {submitting ? "Starting…" : valid ? "Crop PDF" : "Crop too aggressive"}
            </Button>
          }
        >
          <InspectorSection label="Trim margins" hint="Percentage removed from each edge.">
            <LabeledSlider
              label="Top"
              value={top}
              onChange={setTop}
              min={0}
              max={45}
              step={1}
              display={`${top}%`}
            />
            <LabeledSlider
              label="Bottom"
              value={bottom}
              onChange={setBottom}
              min={0}
              max={45}
              step={1}
              display={`${bottom}%`}
            />
            <LabeledSlider
              label="Left"
              value={left}
              onChange={setLeft}
              min={0}
              max={45}
              step={1}
              display={`${left}%`}
            />
            <LabeledSlider
              label="Right"
              value={right}
              onChange={setRight}
              min={0}
              max={45}
              step={1}
              display={`${right}%`}
            />
          </InspectorSection>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            Keeping{" "}
            <span className="font-mono font-medium text-foreground">
              {Math.round(w * 100)}% × {Math.round(h * 100)}%
            </span>{" "}
            of each page.
          </div>
        </InspectorFrame>
      }
    />
  );
}
