import { ListOrdered, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateReorderJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { SortablePageCanvas } from "@/features/studio/sortable-page-canvas";
import { CanvasHeader, CanvasInstruction } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function ReorderTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [order, setOrder] = useState<number[]>([]);
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const create = useCreateReorderJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed order whenever the file / page count changes
  useEffect(() => {
    setExcluded(new Set());
    setOrder(pageCount != null ? Array.from({ length: pageCount }, (_, i) => i + 1) : []);
  }, [file, pageCount]);

  const moveTo = (from: number, to: number) =>
    setOrder((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length || from === to)
        return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next;
    });

  const toggle = (page: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });

  const reset = () => {
    setExcluded(new Set());
    setOrder(pageCount != null ? Array.from({ length: pageCount }, (_, i) => i + 1) : []);
  };

  const finalOrder = order.filter((p) => !excluded.has(p));
  const touched =
    excluded.size > 0 || order.some((p, i) => p !== i + 1) || finalOrder.length !== order.length;

  const onRun = async () => {
    if (finalOrder.length === 0) return;
    const result = await run({
      file,
      kind: "reorder",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, order: finalOrder, idempotencyKey });
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
            pageCount={pageCount}
            onReplaceFile={onReplaceFile}
            onRemove={onRemove}
          />
          <CanvasInstruction>
            Drag pages to rearrange them. Tap a page to drop it from the output — tap again to bring
            it back.
          </CanvasInstruction>
          <SortablePageCanvas
            file={file}
            order={order}
            excluded={excluded}
            onReorder={moveTo}
            onToggle={toggle}
          />
        </div>
      }
      inspector={
        <InspectorFrame
          toolId="reorder"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting || finalOrder.length === 0}
              className="w-full"
            >
              {submitting ? <Spinner /> : <ListOrdered />}
              {submitting
                ? "Starting…"
                : finalOrder.length === 0
                  ? "Keep at least one page"
                  : "Apply new order"}
            </Button>
          }
        >
          <InspectorSection label="Output" hint="Drag in the canvas; tap to drop pages.">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Pages kept" value={`${finalOrder.length}`} />
              <Stat label="Dropped" value={`${excluded.size}`} />
            </div>
            {touched ? (
              <Button variant="outline" size="sm" onClick={reset} className="self-start">
                <RotateCcw />
                Reset to original
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pages are in their original order. Rearrange them on the left.
              </p>
            )}
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border/60 bg-muted/30 p-3">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-display text-lg font-semibold">{value}</span>
    </div>
  );
}
