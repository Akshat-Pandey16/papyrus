import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type DragHandleProps = {
  attributes: HTMLAttributes<HTMLElement>;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
};

type SortableItemProps = {
  id: string;
  disabled: boolean;
  children: (handle: DragHandleProps) => ReactNode;
};

function SortableItem({ id, disabled, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };
  return (
    <li ref={setNodeRef} style={style}>
      {children({ attributes, listeners, isDragging })}
    </li>
  );
}

export type SortableListProps = {
  ids: string[];
  onReorder: (from: number, to: number) => void;
  disabled?: boolean;
  className?: string;
  renderItem: (id: string, index: number, handle: DragHandleProps) => ReactNode;
};

export function SortableList({
  ids,
  onReorder,
  disabled = false,
  className,
  renderItem,
}: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={className}>
          {ids.map((id, index) => (
            <SortableItem key={id} id={id} disabled={disabled}>
              {(handle) => renderItem(id, index, handle)}
            </SortableItem>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

export { arrayMove };
