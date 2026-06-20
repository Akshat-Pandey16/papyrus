import { ChevronLeft, ChevronRight, Eraser, PenLine, Square, Type } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { OverlayOp } from "@/features/pdf-tools/api";
import { usePdfRenderer } from "@/features/studio/page-canvas";
import { ColorPicker, type Rgb } from "@/features/studio/tools/overlay-shared";
import { cn } from "@/lib/utils";

export type EditorTool = "box" | "ink" | "text";
export type EditorMode = "redact" | "sign" | "edit";

type Point = { x: number; y: number };

type Shape =
  | { id: string; kind: "box"; page: number; x: number; y: number; w: number; h: number }
  | { id: string; kind: "ink"; page: number; points: Point[]; color: Rgb; width: number }
  | {
      id: string;
      kind: "text";
      page: number;
      x: number;
      y: number;
      text: string;
      size: number;
      color: Rgb;
    };

const TOOLS_BY_MODE: Record<EditorMode, EditorTool[]> = {
  redact: ["box"],
  sign: ["ink", "text"],
  edit: ["text", "ink", "box"],
};

const TOOL_ICON = { box: Square, ink: PenLine, text: Type };
const TOOL_LABEL = { box: "Box", ink: "Draw", text: "Text" };

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function shapesToOps(shapes: Shape[], mode: EditorMode): OverlayOp[] {
  return shapes.map((s) => {
    if (s.kind === "box") {
      const fill: Rgb = mode === "redact" ? [0, 0, 0] : [1, 1, 1];
      return { type: "rect", page: s.page, x: s.x, y: s.y, w: s.w, h: s.h, fill, opacity: 1 };
    }
    if (s.kind === "ink") {
      return {
        type: "line",
        page: s.page,
        points: s.points.map((p) => [p.x, p.y]),
        stroke: s.color,
        stroke_width: s.width,
      };
    }
    return {
      type: "text",
      page: s.page,
      x: s.x,
      y: s.y,
      text: s.text,
      size: s.size,
      color: s.color,
      align: "left",
    };
  });
}

export function OverlayEditor({
  file,
  mode,
  onOpsChange,
}: {
  file: File;
  mode: EditorMode;
  onOpsChange: (ops: OverlayOp[]) => void;
}) {
  const { total, error, renderPage } = usePdfRenderer(file);
  const [page, setPage] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState<EditorTool>(TOOLS_BY_MODE[mode][0] ?? "box");
  const [color, setColor] = useState<Rgb>(mode === "edit" ? [0.1, 0.1, 0.1] : [0.1, 0.2, 0.6]);
  const textSize = 18;
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(
    null,
  );
  const surfaceRef = useRef<HTMLDivElement>(null);
  const textInputId = useId();
  const pageCount = total ?? 0;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSrc(null);
    renderPage(page)
      .then((url) => {
        if (active) setSrc(url);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, renderPage]);

  useEffect(() => {
    onOpsChange(shapesToOps(shapes, mode));
  }, [shapes, mode, onOpsChange]);

  const norm = (e: ReactPointerEvent): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!src || pendingText) return;
    const p = norm(e);
    if (tool === "text") {
      setPendingText({ x: p.x, y: p.y, value: "" });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "box") {
      setDraft({ id: rid(), kind: "box", page: page + 1, x: p.x, y: p.y, w: 0, h: 0 });
    } else {
      setDraft({ id: rid(), kind: "ink", page: page + 1, points: [p], color, width: 2.5 });
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!draft) return;
    const p = norm(e);
    if (draft.kind === "box") {
      const x = Math.min(p.x, draft.x);
      const y = Math.min(p.y, draft.y);
      const w = Math.abs(p.x - draft.x);
      const h = Math.abs(p.y - draft.y);
      setDraft({ ...draft, x, y, w, h });
    } else if (draft.kind === "ink") {
      setDraft({ ...draft, points: [...draft.points, p] });
    }
  };

  const onPointerUp = () => {
    if (!draft) return;
    const valid =
      draft.kind === "box"
        ? draft.w > 0.01 && draft.h > 0.01
        : draft.kind === "ink"
          ? draft.points.length > 1
          : true;
    if (valid) setShapes((prev) => [...prev, draft]);
    setDraft(null);
  };

  const commitText = () => {
    if (pendingText && pendingText.value.trim()) {
      setShapes((prev) => [
        ...prev,
        {
          id: rid(),
          kind: "text",
          page: page + 1,
          x: pendingText.x,
          y: pendingText.y,
          text: pendingText.value.trim(),
          size: textSize,
          color,
        },
      ]);
    }
    setPendingText(null);
  };

  const undo = () => setShapes((prev) => prev.slice(0, -1));
  const clearPage = () => setShapes((prev) => prev.filter((s) => s.page !== page + 1));

  const tools = TOOLS_BY_MODE[mode];
  const pageShapes = shapes.filter((s) => s.page === page + 1);
  const liveShapes = draft ? [...pageShapes, draft] : pageShapes;

  if (error) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
        This file can't be previewed for editing. Try a smaller PDF (under 50 MB).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-clay-sm">
        <div className="flex items-center gap-1">
          {tools.map((t) => {
            const Icon = TOOL_ICON[t];
            return (
              <Button
                key={t}
                variant={tool === t ? "molten" : "ghost"}
                size="sm"
                onClick={() => setTool(t)}
              >
                <Icon className="size-4" />
                {TOOL_LABEL[t]}
              </Button>
            );
          })}
        </div>
        {(tool === "ink" || tool === "text") && mode !== "redact" ? (
          <div className="ml-auto">
            <ColorPicker value={color} onChange={setColor} />
          </div>
        ) : null}
        <div
          className={cn(
            "flex items-center gap-1",
            tool === "box" || mode === "redact" ? "ml-auto" : "",
          )}
        >
          <Button variant="ghost" size="sm" onClick={undo} disabled={pageShapes.length === 0}>
            <Eraser className="size-4" />
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={clearPage} disabled={pageShapes.length === 0}>
            Clear page
          </Button>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[760px]">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer drawing surface */}
        <div
          ref={surfaceRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={cn(
            "relative select-none overflow-hidden rounded-2xl border border-border/70 bg-muted/40 shadow-clay-sm",
            tool === "text" ? "cursor-text" : "cursor-crosshair",
          )}
          style={{ touchAction: "none", minHeight: 320 }}
        >
          {src ? (
            <img src={src} alt={`Page ${page + 1}`} className="block w-full" draggable={false} />
          ) : (
            <div className="grid h-[60vh] place-items-center text-muted-foreground">
              {loading ? <Spinner /> : "Page unavailable"}
            </div>
          )}

          <svg
            aria-hidden
            role="presentation"
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <title>Annotation overlay</title>
            {liveShapes.map((s) =>
              s.kind === "ink" ? (
                <polyline
                  key={s.id}
                  points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={`rgb(${s.color[0] * 255},${s.color[1] * 255},${s.color[2] * 255})`}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
          </svg>

          {liveShapes.map((s) =>
            s.kind === "box" ? (
              <div
                key={s.id}
                className={cn(
                  "pointer-events-none absolute",
                  mode === "redact"
                    ? "bg-black"
                    : "border-2 border-dashed border-foreground bg-white/70",
                )}
                style={{
                  left: `${s.x * 100}%`,
                  top: `${s.y * 100}%`,
                  width: `${s.w * 100}%`,
                  height: `${s.h * 100}%`,
                }}
              />
            ) : s.kind === "text" ? (
              <span
                key={s.id}
                className="pointer-events-none absolute whitespace-pre font-medium"
                style={{
                  left: `${s.x * 100}%`,
                  top: `${s.y * 100}%`,
                  fontSize: s.size,
                  color: `rgb(${s.color[0] * 255},${s.color[1] * 255},${s.color[2] * 255})`,
                }}
              >
                {s.text}
              </span>
            ) : null,
          )}

          {pendingText ? (
            <div
              className="absolute z-10"
              style={{ left: `${pendingText.x * 100}%`, top: `${pendingText.y * 100}%` }}
            >
              {/* biome-ignore lint/a11y/noAutofocus: inline text placement needs immediate focus */}
              <Input
                id={textInputId}
                autoFocus
                value={pendingText.value}
                onChange={(e) => setPendingText({ ...pendingText, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") setPendingText(null);
                }}
                onBlur={commitText}
                placeholder="Type…"
                className="h-8 w-40"
              />
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Page {page + 1}
            {pageCount > 0 ? ` / ${pageCount}` : ""}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPage((p) => Math.min(pageCount - 1 || p, p + 1))}
            disabled={pageCount > 0 && page >= pageCount - 1}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
