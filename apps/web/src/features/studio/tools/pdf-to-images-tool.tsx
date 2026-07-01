import { Images } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { useCreatePdfToImagesJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import { LabeledSlider } from "@/features/studio/tools/overlay-shared";
import type { SingleToolProps } from "@/features/studio/types";

export function PdfToImagesTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(85);
  const create = useCreatePdfToImagesJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "pdf_to_images",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          imageFormat: format,
          dpi,
          quality,
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
          instruction="Each page becomes its own image. You'll get a ZIP with one file per page."
        />
      }
      inspector={
        <InspectorFrame
          toolId="pdf_to_images"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Images />}
              {submitting ? "Starting…" : "Export images"}
            </Button>
          }
        >
          <InspectorSection label="Format">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: "jpeg", label: "JPG" },
                { value: "png", label: "PNG" },
              ]}
            />
          </InspectorSection>

          <InspectorSection label="Resolution" hint="Higher DPI means sharper, larger images.">
            <LabeledSlider
              label="DPI"
              value={dpi}
              onChange={setDpi}
              min={72}
              max={300}
              step={6}
              display={`${dpi} dpi`}
            />
            {format === "jpeg" ? (
              <LabeledSlider
                label="Quality"
                value={quality}
                onChange={setQuality}
                min={40}
                max={100}
                step={5}
                display={`${quality}%`}
              />
            ) : null}
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
