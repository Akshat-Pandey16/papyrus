import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreatePdfaJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function PdfaTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const create = useCreatePdfaJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "pdfa",
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
          instruction="Convert to PDF/A — the self-contained format built for long-term archiving."
        />
      }
      inspector={
        <InspectorFrame
          toolId="pdfa"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Archive />}
              {submitting ? "Starting…" : "Convert to PDF/A"}
            </Button>
          }
        >
          <InspectorSection label="Archival PDF/A" hint="ISO 19005 — for the long haul.">
            <p className="text-xs leading-relaxed text-muted-foreground">
              PDF/A embeds everything a reader needs — fonts, color, structure — so the file looks
              the same decades from now. It's what courts, libraries, and compliance teams ask for.
              Colors and fonts may shift slightly so the file can stand on its own.
            </p>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
