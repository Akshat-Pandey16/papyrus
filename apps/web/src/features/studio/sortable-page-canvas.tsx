import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import {
  MorePagesTile,
  PAGE_CANVAS_CAP,
  PAGE_GRID_CLASS,
  PageThumb,
  type PdfRenderer,
  useLazyThumb,
  usePdfRenderer,
} from "@/features/studio/page-canvas";
import { cn } from "@/lib/utils";

export type SortablePageCanvasProps = {
  file: File;
  order: number[];
  excluded: ReadonlySet<number>;
  onReorder: (from: number, to: number) => void;
  onToggle: (page: number) => void;
};

export function SortablePageCanvas({
  file,
  order,
  excluded,
  onReorder,
  onToggle,
}: SortablePageCanvasProps) {
  const renderer = usePdfRenderer(file);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  if (renderer.error) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        Preview unavailable: {renderer.error}
      </div>
    );
  }
  if (renderer.total == null) {
    return (
      <div className={PAGE_GRID_CLASS}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`s-${i.toString()}`}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-card p-1.5"
          >
            <div className="aspect-[3/4] w-full animate-pulse rounded-lg bg-muted" />
            <span className="h-2.5 w-4 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  const visible = order.slice(0, PAGE_CANVAS_CAP);
  const restCount = order.length - visible.length;

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(Number(active.id));
    const to = order.indexOf(Number(over.id));
    if (from === -1 || to === -1) return;
    onReorder(from, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visible.map(String)} strategy={rectSortingStrategy}>
        <div className={PAGE_GRID_CLASS}>
          {visible.map((page) => (
            <SortableThumb
              key={page}
              page={page}
              renderer={renderer}
              excluded={excluded.has(page)}
              onToggle={onToggle}
            />
          ))}
          {restCount > 0 ? <MorePagesTile count={restCount} hint="kept in order" /> : null}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableThumb({
  page,
  renderer,
  excluded,
  onToggle,
}: {
  page: number;
  renderer: PdfRenderer;
  excluded: boolean;
  onToggle: (page: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(page),
  });
  const { ref, src } = useLazyThumb(renderer.renderPage, page);

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        zIndex: isDragging ? 20 : undefined,
      }}
      onClick={() => onToggle(page)}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex touch-none cursor-grab flex-col items-center gap-1.5 rounded-xl border p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        isDragging
          ? "border-primary bg-card shadow-clay-lg ring-2 ring-primary/40"
          : "border-border/70 bg-card hover:border-primary/40",
        excluded && "opacity-45",
      )}
    >
      <PageThumb index={page} src={src} imgRef={ref} />
      {excluded ? (
        <span className="absolute inset-1.5 mb-5 grid place-items-center rounded-lg bg-oxblood/55 backdrop-blur-[1px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">
            <Trash2 className="size-3" />
            Dropped
          </span>
        </span>
      ) : null}
    </button>
  );
}
