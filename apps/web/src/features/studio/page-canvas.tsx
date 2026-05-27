import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import { cn } from "@/lib/utils";

export type PageCanvasProps = {
  file: File;
  maxPages?: number | undefined;
  rotations?: Record<number, number> | undefined;
  onPageClick?: ((pageNumber: number) => void) | undefined;
  selectedPages?: ReadonlySet<number> | undefined;
  selectionOrder?: Map<number, number> | undefined;
  highlightedPages?: ReadonlySet<number> | undefined;
  className?: string | undefined;
};

export const PAGE_CANVAS_CAP = 150;
export const PAGE_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(124px,1fr))]";

type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport(opts: { scale: number }): PdfViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
    canvas: HTMLCanvasElement;
  }): { promise: Promise<void> };
  cleanup(): void;
};
type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
  cleanup(): void;
};

const TARGET_WIDTH = 224;
const MAX_SCALE = 2;
const JPEG_QUALITY = 0.8;
const CACHE_FILES = 4;

const renderCache = new Map<File, Map<number, string>>();

function fileCache(file: File): Map<number, string> {
  let m = renderCache.get(file);
  if (!m) {
    m = new Map();
    renderCache.set(file, m);
    if (renderCache.size > CACHE_FILES) {
      const oldestKey = renderCache.keys().next().value;
      if (oldestKey) {
        const old = renderCache.get(oldestKey);
        if (old) for (const url of old.values()) URL.revokeObjectURL(url);
        renderCache.delete(oldestKey);
      }
    }
  }
  return m;
}

function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(new Error("Could not encode page preview."));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export type PdfRenderer = {
  total: number | null;
  error: string | null;
  renderPage: (index: number) => Promise<string | null>;
};

export function usePdfRenderer(file: File): PdfRenderer {
  const docRef = useRef<PdfDoc | null>(null);
  const tokenRef = useRef(0);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = ++tokenRef.current;
    setTotal(null);
    setError(null);
    docRef.current = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      const data = await file.arrayBuffer();
      if (token !== tokenRef.current) return;
      const doc = (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
      if (token !== tokenRef.current) {
        void doc.destroy();
        return;
      }
      docRef.current = doc;
      setTotal(doc.numPages);
    })().catch((err) => {
      if (token === tokenRef.current) {
        setError(err instanceof Error ? err.message : "Could not read this PDF.");
      }
    });
    return () => {
      tokenRef.current++;
      const doc = docRef.current;
      docRef.current = null;
      if (doc) void doc.destroy();
    };
  }, [file]);

  const renderPage = useCallback(
    async (index: number): Promise<string | null> => {
      const cache = fileCache(file);
      const hit = cache.get(index);
      if (hit) return hit;
      const doc = docRef.current;
      if (!doc) return null;
      const page = await doc.getPage(index);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_SCALE, TARGET_WIDTH / unscaled.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        page.cleanup();
        return null;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      page.cleanup();
      const url = await canvasToObjectUrl(canvas);
      cache.set(index, url);
      return url;
    },
    [file],
  );

  return { total, error, renderPage };
}

export function useLazyThumb(renderPage: (index: number) => Promise<string | null>, index: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            io.disconnect();
            renderPage(index)
              .then((url) => {
                if (alive && url) setSrc(url);
              })
              .catch(() => {});
          }
        }
      },
      { rootMargin: "500px 0px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [index, renderPage]);

  return { ref, src };
}

export function PageThumb({
  index,
  src,
  rotation = 0,
  order,
  imgRef,
}: {
  index: number;
  src: string | null;
  rotation?: number;
  order?: number | undefined;
  imgRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <>
      <div
        ref={imgRef}
        className="relative w-full overflow-hidden rounded-lg bg-white shadow-inner"
      >
        {src ? (
          <img
            src={src}
            alt={`Page ${index}`}
            loading="lazy"
            draggable={false}
            className="aspect-[3/4] w-full object-contain transition-transform duration-300 ease-[var(--ease-spring)] select-none"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        ) : (
          <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
        )}
        {rotation !== 0 ? (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-oxblood/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur">
            {rotation}°
          </span>
        ) : null}
        {order != null ? (
          <span className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-molten font-mono text-[11px] font-bold text-primary-foreground shadow-clay-sm">
            {order}
          </span>
        ) : null}
      </div>
      <span className="font-mono text-[10px] font-medium text-muted-foreground">{index}</span>
    </>
  );
}

export function PageCanvas({
  file,
  maxPages = PAGE_CANVAS_CAP,
  rotations,
  onPageClick,
  selectedPages,
  selectionOrder,
  highlightedPages,
  className,
}: PageCanvasProps) {
  const { total, error, renderPage } = usePdfRenderer(file);

  if (error) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        Preview unavailable: {error}
      </div>
    );
  }

  const count = total == null ? 0 : Math.min(total, maxPages, PAGE_CANVAS_CAP);
  const remaining = total == null ? 0 : total - count;
  const interactive = !!onPageClick;

  return (
    <div className={cn(PAGE_GRID_CLASS, className)}>
      {total == null
        ? Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`skeleton-${i.toString()}`}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-card p-1.5"
            >
              <div className="aspect-[3/4] w-full animate-pulse rounded-lg bg-muted" />
              <span className="h-2.5 w-4 animate-pulse rounded bg-muted" />
            </div>
          ))
        : null}

      {Array.from({ length: count }).map((_, i) => {
        const index = i + 1;
        return (
          <LazyPage
            key={index}
            index={index}
            renderPage={renderPage}
            interactive={interactive}
            rotation={rotations?.[index] ?? 0}
            selected={selectedPages?.has(index) ?? false}
            order={selectionOrder?.get(index)}
            highlighted={highlightedPages?.has(index) ?? false}
            onClick={onPageClick}
          />
        );
      })}

      {remaining > 0 ? <MorePagesTile count={remaining} /> : null}
    </div>
  );
}

export function MorePagesTile({ count, hint }: { count: number; hint?: string }) {
  return (
    <div className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-card/40 p-2 text-center">
      <span className="font-display text-lg font-semibold text-foreground">+{count}</span>
      <span className="text-[10px] text-muted-foreground">{hint ?? "more pages"}</span>
    </div>
  );
}

type LazyPageProps = {
  index: number;
  renderPage: (index: number) => Promise<string | null>;
  interactive: boolean;
  rotation: number;
  selected: boolean;
  order: number | undefined;
  highlighted: boolean;
  onClick?: ((page: number) => void) | undefined;
};

function LazyPage({
  index,
  renderPage,
  interactive,
  rotation,
  selected,
  order,
  highlighted,
  onClick,
}: LazyPageProps) {
  const { ref, src } = useLazyThumb(renderPage, index);

  const cardClass = cn(
    "group relative flex flex-col items-center gap-1.5 rounded-xl border p-1.5 outline-none transition-all duration-200",
    interactive &&
      "cursor-pointer hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-primary bg-primary/8 ring-2 ring-primary/30"
      : highlighted
        ? "border-primary/50 bg-primary/5"
        : "border-border/70 bg-card hover:border-primary/40",
  );

  if (interactive) {
    return (
      <button type="button" onClick={() => onClick?.(index)} className={cardClass}>
        <PageThumb index={index} src={src} rotation={rotation} order={order} imgRef={ref} />
      </button>
    );
  }
  return (
    <div className={cardClass}>
      <PageThumb index={index} src={src} rotation={rotation} order={order} imgRef={ref} />
    </div>
  );
}
