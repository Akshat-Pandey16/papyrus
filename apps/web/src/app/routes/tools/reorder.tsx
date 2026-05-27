import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, TextSelect, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ToolOptionsHeader, ToolPageShell } from "@/components/layout/tool-page-shell";
import { SortableList } from "@/components/shared/sortable-list";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useCreateReorderJobMutation } from "@/features/pdf-tools/api";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ToolJobCard } from "@/features/pdf-tools/tool-job-card";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";

export const Route = createFileRoute("/tools/reorder")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: ReorderPage,
});

function ReorderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const { pageCount } = useFilePageCount(file);
  const create = useCreateReorderJobMutation();
  const { run, submitting } = useSingleFileJobRunner();
  const uploadsMap = useUploadStore((s) => s.uploads);

  const selectAll = () => {
    if (!pageCount) return;
    setOrder(Array.from({ length: pageCount }, (_, i) => i + 1));
  };

  const sortedIds = useMemo(
    () =>
      Object.values(uploadsMap)
        .filter((e) => e.kind === "reorder")
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => e.clientUploadId),
    [uploadsMap],
  );

  const addPage = (page: number) => {
    setOrder((prev) => (prev.includes(page) ? prev : [...prev, page]));
  };
  const removePage = (idx: number) => setOrder((prev) => prev.filter((_, i) => i !== idx));
  const moveTo = (from: number, to: number) =>
    setOrder((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length || from === to)
        return prev;
      const next = [...prev];
      const moved = next.splice(from, 1)[0];
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  const move = (idx: number, dir: -1 | 1) => moveTo(idx, idx + dir);

  const onSubmit = async () => {
    if (!file || order.length === 0) return;
    await run({
      file,
      kind: "reorder",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, order, idempotencyKey });
        return { id: job.id };
      },
    });
    setFile(null);
    setOrder([]);
  };

  const hint =
    order.length === 0
      ? pageCount
        ? `Click pages to add them · ${pageCount} available.`
        : "Click pages to add them."
      : `${order.length} of ${pageCount ?? "?"} page(s).`;

  return (
    <ToolPageShell
      tag="Reorder"
      title="Reorder pages"
      description="Click pages on the left to add them, then drag to rearrange. Omitted pages drop."
      icon={TextSelect}
      workspace={
        <>
          <FileDropzone
            onFile={(f) => {
              setFile(f);
              setOrder([]);
            }}
            selectedFile={file}
            onClear={() => {
              setFile(null);
              setOrder([]);
            }}
            disabled={submitting}
          />
          {file ? (
            <PageThumbnails
              file={file}
              onPageClick={addPage}
              selectedPages={new Set(order)}
              maxPages={pageCount ?? 200}
            />
          ) : null}
        </>
      }
      options={
        <>
          <ToolOptionsHeader title="New page order" hint={hint}>
            {pageCount && order.length === 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={selectAll}
                disabled={submitting}
                className="h-8 shrink-0 text-muted-foreground hover:text-foreground"
              >
                Select all
              </Button>
            ) : null}
          </ToolOptionsHeader>
          {order.length > 0 ? (
            <SortableList
              ids={order.map((page) => String(page))}
              onReorder={moveTo}
              disabled={submitting}
              className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-background p-2 text-sm"
              renderItem={(_id, idx, handle) => (
                <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Drag to reorder"
                      className="cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing"
                      {...handle.attributes}
                      {...handle.listeners}
                    >
                      <GripVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span className="font-medium">{idx + 1}.</span>{" "}
                    <span className="text-muted-foreground">Page {order[idx]}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => move(idx, -1)}
                      disabled={submitting || idx === 0}
                      aria-label="Move up"
                      className="h-6 w-6 p-0"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => move(idx, 1)}
                      disabled={submitting || idx === order.length - 1}
                      aria-label="Move down"
                      className="h-6 w-6 p-0"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removePage(idx)}
                      disabled={submitting}
                      aria-label="Remove"
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            />
          ) : null}
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={!file || submitting || order.length === 0}
            className="h-11"
          >
            <ListOrdered className="mr-2 h-4 w-4" />
            {submitting ? "Starting…" : "Apply order"}
          </Button>
        </>
      }
      active={
        sortedIds.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedIds.map((id) => (
              <ToolJobCard key={id} clientUploadId={id} successLabel="Reorder complete" />
            ))}
          </div>
        ) : null
      }
    />
  );
}
