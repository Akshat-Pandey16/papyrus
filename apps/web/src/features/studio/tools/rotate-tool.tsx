import { RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateRotateJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function RotateTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const create = useCreateRotateJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset rotations whenever the file changes
  useEffect(() => {
    setRotations({});
  }, [file]);

  const count = Object.keys(rotations).length;

  const cyclePage = (page: number) => {
    setRotations((prev) => {
      const next = { ...prev };
      const current = next[page] ?? 0;
      const deg = current === 0 ? 90 : current === 90 ? 180 : current === 180 ? 270 : 0;
      if (deg === 0) delete next[page];
      else next[page] = deg;
      return next;
    });
  };

  const applyToAll = (deg: 90 | 180 | 270) => {
    if (!pageCount) return;
    const next: Record<number, number> = {};
    for (let p = 1; p <= pageCount; p++) next[p] = deg;
    setRotations(next);
  };

  const onRun = async () => {
    if (count === 0) return;
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(rotations)) payload[k] = v;
    const result = await run({
      file,
      kind: "rotate",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, rotations: payload, idempotencyKey });
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
          maxPages={pageCount ?? 60}
          rotations={rotations}
          onPageClick={cyclePage}
          instruction="Tap any page to spin it 90° at a time. Untouched pages keep their orientation."
        />
      }
      inspector={
        <InspectorFrame
          toolId="rotate"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting || count === 0}
              className="w-full"
            >
              {submitting ? <Spinner /> : <RotateCw />}
              {submitting
                ? "Starting…"
                : count === 0
                  ? "Tap a page to rotate"
                  : `Rotate ${count} page${count === 1 ? "" : "s"}`}
            </Button>
          }
        >
          <InspectorSection label="Rotate every page" hint="Or tap individual pages on the left.">
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => applyToAll(90)} disabled={!pageCount}>
                <RotateCw />
                90°
              </Button>
              <Button variant="outline" onClick={() => applyToAll(180)} disabled={!pageCount}>
                180°
              </Button>
              <Button variant="outline" onClick={() => applyToAll(270)} disabled={!pageCount}>
                <RotateCcw />
                270°
              </Button>
            </div>
          </InspectorSection>

          <InspectorSection label="Rotation plan">
            {count === 0 ? (
              <p className="text-xs text-muted-foreground">No rotations yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-2 text-xs">
                  {Object.entries(rotations)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([page, deg]) => (
                      <li key={page} className="flex items-center justify-between px-1.5 py-1">
                        <span className="text-muted-foreground">Page {page}</span>
                        <span className="font-mono font-medium text-primary">{deg}°</span>
                      </li>
                    ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRotations({})}
                  className="self-start text-muted-foreground"
                >
                  Clear all
                </Button>
              </div>
            )}
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
