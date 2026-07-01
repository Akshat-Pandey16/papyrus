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

export const PAGE_CANVAS_CAP = 300;
export const PREVIEW_MAX_BYTES = 50 * 1024 * 1024;
export const PARSE_MAX_BYTES = 150 * 1024 * 1024;
export const PAGE_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(124px,1fr))]";

const MAX_CONCURRENT_RENDERS = 4;
let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
  }
  activeRenders += 1;
  try {
    return await fn();
  } finally {
    activeRenders -= 1;
    const next = renderWaiters.shift();
    if (next) next();
  }
}

type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel(): void };
type PdfPage = {
  getViewport(opts: { scale: number }): PdfViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
    canvas: HTMLCanvasElement;
  }): PdfRenderTask;
  cleanup(): void;
};
type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
  cleanup(): void;
};

const TARGET_WIDTH = 224;
const MAX_DPR = 2;
const MAX_CANVAS_WIDTH = 2200;
const JPEG_QUALITY = 0.8;
const DOC_CACHE_FILES = 2;
const PREVIEW_TOO_LARGE = "preview_too_large";

const renderCache = new Map<File, Map<string, string>>();
const docCache = new Map<File, Promise<PdfDoc>>();
const inflightRenders = new Map<File, Set<PdfRenderTask>>();
const filePasswords = new Map<File, string>();

function isRenderCancelled(err: unknown): boolean {
  return Boolean(err) && (err as { name?: string }).name === "RenderingCancelledException";
}

function trackRender(file: File, task: PdfRenderTask): void {
  let set = inflightRenders.get(file);
  if (!set) {
    set = new Set();
    inflightRenders.set(file, set);
  }
  set.add(task);
}

function untrackRender(file: File, task: PdfRenderTask): void {
  const set = inflightRenders.get(file);
  if (!set) return;
  set.delete(task);
  if (set.size === 0) inflightRenders.delete(file);
}

function cancelRenders(file: File): void {
  const set = inflightRenders.get(file);
  if (!set) return;
  for (const task of set) task.cancel();
  inflightRenders.delete(file);
}

function resolvePixelWidth(targetWidth: number): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.min(MAX_CANVAS_WIDTH, Math.round(targetWidth * Math.min(MAX_DPR, dpr)));
}

function renderKey(index: number, pixelWidth: number): string {
  return `${index}:${pixelWidth}`;
}

export function getFilePassword(file: File): string | undefined {
  return filePasswords.get(file);
}

export function setFilePassword(file: File, password: string): void {
  filePasswords.set(file, password);
  evictFile(file);
}

export function isPasswordException(err: unknown): boolean {
  return Boolean(err) && (err as { name?: string }).name === "PasswordException";
}

export async function probePdfNeedsPassword(file: File): Promise<boolean> {
  try {
    await getCachedDoc(file);
    return false;
  } catch (err) {
    if (isPasswordException(err)) return true;
    throw err;
  }
}

export async function verifyPdfPassword(file: File, password: string): Promise<boolean> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  try {
    const doc = (await pdfjs.getDocument({ data, password }).promise) as unknown as PdfDoc;
    void doc.destroy().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function evictFile(file: File): void {
  cancelRenders(file);
  const urls = renderCache.get(file);
  if (urls) {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    renderCache.delete(file);
  }
  const doc = docCache.get(file);
  docCache.delete(file);
  if (doc) void doc.then((d) => d.destroy()).catch(() => {});
}

export function getCachedDoc(file: File): Promise<PdfDoc> {
  return getDoc(file);
}

function getDoc(file: File): Promise<PdfDoc> {
  let p = docCache.get(file);
  if (!p) {
    const password = filePasswords.get(file);
    p = (async () => {
      const pdfjs = await loadPdfjs();
      const data = await file.arrayBuffer();
      const params = password === undefined ? { data } : { data, password };
      return (await pdfjs.getDocument(params).promise) as unknown as PdfDoc;
    })();
    docCache.set(file, p);
    while (docCache.size > DOC_CACHE_FILES) {
      const oldest = docCache.keys().next().value;
      if (!oldest || oldest === file) break;
      evictFile(oldest);
    }
  }
  return p;
}

function fileCache(file: File): Map<string, string> {
  let m = renderCache.get(file);
  if (!m) {
    m = new Map();
    renderCache.set(file, m);
    while (renderCache.size > DOC_CACHE_FILES) {
      const oldest = renderCache.keys().next().value;
      if (!oldest || oldest === file) break;
      evictFile(oldest);
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
  renderPage: (index: number, targetWidth?: number) => Promise<string | null>;
};

export function usePdfRenderer(file: File): PdfRenderer {
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTotal(null);
    setError(null);
    if (file.size > PARSE_MAX_BYTES) {
      setError(PREVIEW_TOO_LARGE);
      return;
    }
    getDoc(file)
      .then((doc) => {
        if (alive) setTotal(doc.numPages);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Could not read this PDF.");
      });
    return () => {
      alive = false;
    };
  }, [file]);

  const renderPage = useCallback(
    async (index: number, targetWidth: number = TARGET_WIDTH): Promise<string | null> => {
      if (file.size > PREVIEW_MAX_BYTES) return null;
      const pixelWidth = resolvePixelWidth(targetWidth);
      const key = renderKey(index, pixelWidth);
      const cache = fileCache(file);
      const hit = cache.get(key);
      if (hit) return hit;
      const doc = await getDoc(file);
      return withRenderSlot(async () => {
        const existing = cache.get(key);
        if (existing) return existing;
        const page = await doc.getPage(index);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = pixelWidth / unscaled.width;
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
        const task = page.render({ canvasContext: ctx, viewport, canvas });
        trackRender(file, task);
        try {
          await task.promise;
        } catch (err) {
          page.cleanup();
          if (isRenderCancelled(err)) return null;
          throw err;
        } finally {
          untrackRender(file, task);
        }
        page.cleanup();
        const url = await canvasToObjectUrl(canvas);
        cache.set(key, url);
        return url;
      });
    },
    [file],
  );

  return { total, error, renderPage };
}

export function useLazyThumb(
  renderPage: (index: number, targetWidth?: number) => Promise<string | null>,
  index: number,
) {
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
  numbered = false,
}: {
  index: number;
  src: string | null;
  rotation?: number;
  order?: number | undefined;
  imgRef?: React.Ref<HTMLDivElement>;
  numbered?: boolean;
}) {
  return (
    <>
      <div
        ref={imgRef}
        className="relative w-full overflow-hidden rounded-md bg-white shadow-clay-sm ring-1 ring-black/[0.05]"
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
        ) : numbered ? (
          <div className="grid aspect-[3/4] w-full place-items-center bg-muted/50">
            <span className="font-display text-lg font-semibold text-muted-foreground">
              {index}
            </span>
          </div>
        ) : (
          <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
        )}
        {rotation !== 0 ? (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-oxblood/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur">
            {rotation}°
          </span>
        ) : null}
        {order != null ? (
          <span className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-primary font-mono text-[11px] font-bold text-primary-foreground shadow-clay-sm">
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

  if (error === PREVIEW_TOO_LARGE) {
    return <LargeFileNotice />;
  }
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
  const numbered = file.size > PREVIEW_MAX_BYTES;

  return (
    <div className={cn(PAGE_GRID_CLASS, className)}>
      {total == null
        ? Array.from({ length: 8 }).map((_, i) => (
            <div key={`skeleton-${i.toString()}`} className="flex flex-col items-center gap-1.5">
              <div className="aspect-[3/4] w-full animate-pulse rounded-md bg-muted" />
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
            numbered={numbered}
          />
        );
      })}

      {remaining > 0 ? <MorePagesTile count={remaining} /> : null}
    </div>
  );
}

export function isPreviewTooLargeError(error: string | null): boolean {
  return error === PREVIEW_TOO_LARGE;
}

export function LargeFileNotice() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Previews are off for large files</span>
      <span className="max-w-md text-xs">
        To keep things fast we skip thumbnails above 50&nbsp;MB. Your file uploads and processes
        normally — every page is included.
      </span>
    </div>
  );
}

export function MorePagesTile({ count, hint }: { count: number; hint?: string }) {
  return (
    <div className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-card/40 p-2 text-center">
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
  numbered?: boolean;
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
  numbered = false,
}: LazyPageProps) {
  const { ref, src } = useLazyThumb(renderPage, index);

  const cardClass = cn(
    "group relative flex flex-col items-center gap-1.5 rounded-lg p-1 outline-none transition-[transform,box-shadow] duration-200",
    interactive &&
      "cursor-pointer hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    selected
      ? "ring-2 ring-primary ring-offset-2 ring-offset-canvas"
      : highlighted
        ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-canvas"
        : "",
  );

  if (interactive) {
    return (
      <button type="button" onClick={() => onClick?.(index)} className={cardClass}>
        <PageThumb
          index={index}
          src={src}
          rotation={rotation}
          order={order}
          imgRef={ref}
          numbered={numbered}
        />
      </button>
    );
  }
  return (
    <div className={cardClass}>
      <PageThumb index={index} src={src} rotation={rotation} order={order} imgRef={ref} />
    </div>
  );
}
