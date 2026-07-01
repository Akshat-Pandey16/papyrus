import { LayoutGrid } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { useCreateNupJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

type PerSheet = "2" | "4" | "6" | "9" | "16";

export function NupTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [perSheet, setPerSheet] = useState<PerSheet>("4");
  const create = useCreateNupJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "nup",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          pagesPerSheet: Number(perSheet),
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
          instruction="Place several pages onto each sheet — perfect for handouts and saving paper."
        />
      }
      inspector={
        <InspectorFrame
          toolId="nup"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <LayoutGrid />}
              {submitting ? "Starting…" : "Combine pages"}
            </Button>
          }
        >
          <InspectorSection label="Pages per sheet" hint="How many pages to fit on each new page.">
            <Segmented
              value={perSheet}
              onChange={setPerSheet}
              ariaLabel="Pages per sheet"
              options={[
                { value: "2", label: "2" },
                { value: "4", label: "4" },
                { value: "6", label: "6" },
                { value: "9", label: "9" },
                { value: "16", label: "16" },
              ]}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your pages are scaled down and laid out in a grid, left to right and top to bottom.
              The last sheet may be partly empty if the page count doesn't divide evenly.
            </p>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
