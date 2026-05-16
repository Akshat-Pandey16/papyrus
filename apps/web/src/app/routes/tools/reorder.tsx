import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, X } from "lucide-react";
import { type DragEvent, useMemo, useState } from "react";
import { AnonymousBanner } from "@/components/shared/anonymous-banner";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useCreateReorderJobMutation } from "@/features/pdf-tools/api";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ToolJobCard } from "@/features/pdf-tools/tool-job-card";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tools/reorder")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: ReorderPage,
});

function ReorderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
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
  const move = (idx: number, dir: -1 | 1) =>
    setOrder((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const moved = next.splice(idx, 1)[0];
      if (moved === undefined) return prev;
      next.splice(target, 0, moved);
      return next;
    });

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

  const onDragStart = (e: DragEvent<HTMLLIElement>, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const onDragOver = (e: DragEvent<HTMLLIElement>, idx: number) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIndex !== idx) setOverIndex(idx);
  };
  const onDragLeave = () => setOverIndex(null);
  const onDrop = (e: DragEvent<HTMLLIElement>, idx: number) => {
    e.preventDefault();
    const raw = dragIndex ?? Number(e.dataTransfer.getData("text/plain"));
    const from = Number.isFinite(raw) ? Number(raw) : null;
    setDragIndex(null);
    setOverIndex(null);
    if (from === null) return;
    moveTo(from, idx);
  };
  const onDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

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

  return (
    <div className="w-full px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <AnonymousBanner />
        <header className="flex flex-col gap-2">
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]">
            Click pages on the left to add them, then drag to rearrange on the right. Omitted pages
            are dropped.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
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
          </div>

          <aside className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold">New page order</h2>
                <p className="text-xs text-muted-foreground">
                  {order.length === 0
                    ? pageCount
                      ? `Click pages to add them · ${pageCount} available.`
                      : "Click pages to add them."
                    : `${order.length} of ${pageCount ?? "?"} page(s).`}
                </p>
              </div>
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
            </div>
            {order.length > 0 ? (
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-background p-2 text-sm">
                {order.map((page, idx) => (
                  <li
                    key={`${page}-${idx.toString()}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, idx)}
                    onDragOver={(e) => onDragOver(e, idx)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, idx)}
                    onDragEnd={onDragEnd}
                    className={cn(
                      "flex cursor-grab items-center justify-between gap-2 rounded px-2 py-1.5 transition-all active:cursor-grabbing",
                      dragIndex === idx && "opacity-40",
                      overIndex === idx &&
                        dragIndex !== null &&
                        dragIndex !== idx &&
                        "bg-foreground/5 ring-2 ring-foreground/20",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <GripVertical
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                        aria-hidden
                      />
                      <span className="font-medium">{idx + 1}.</span>{" "}
                      <span className="text-muted-foreground">Page {page}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => move(idx, -1)}
                        aria-label="Move up"
                        className="h-6 w-6 p-0"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => move(idx, 1)}
                        aria-label="Move down"
                        className="h-6 w-6 p-0"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removePage(idx)}
                        aria-label="Remove"
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
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
          </aside>
        </section>

        {sortedIds.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Active</h2>
            <div className="flex flex-col gap-3">
              {sortedIds.map((id) => (
                <ToolJobCard key={id} clientUploadId={id} successLabel="Reorder complete" />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
