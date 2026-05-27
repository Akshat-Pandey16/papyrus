import { useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import { cn } from "@/lib/utils";

type PageMeta = {
  index: number;
  src: string;
};

export type PageThumbnailsProps = {
  file: File | null;
  maxPages?: number;
  rotations?: Record<number, number>;
  onPageClick?: (pageNumber: number) => void;
  selectedPages?: ReadonlySet<number>;
  className?: string;
};

const _TARGET_DEVICE_WIDTH = 192;
const _MAX_RENDER_SCALE = 1.5;
const _JPEG_QUALITY = 0.72;

function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(new Error("Could not encode page preview."));
      },
      "image/jpeg",
      _JPEG_QUALITY,
    );
  });
}

function revokeAll(urls: string[]): void {
  for (const url of urls) URL.revokeObjectURL(url);
}

export function PageThumbnails({
  file,
  maxPages = 12,
  rotations,
  onPageClick,
  selectedPages,
  className,
}: PageThumbnailsProps) {
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!file) {
      setPages([]);
      setError(null);
      return;
    }
    const token = ++tokenRef.current;
    const localUrls: string[] = [];
    urlsRef.current = localUrls;
    setLoading(true);
    setError(null);
    setPages([]);

    (async () => {
      const pdfjs = await loadPdfjs();
      const data = await file.arrayBuffer();
      if (token !== tokenRef.current) return;
      const doc = await pdfjs.getDocument({ data }).promise;
      if (token !== tokenRef.current) {
        void doc.destroy();
        return;
      }
      try {
        const count = Math.min(doc.numPages, maxPages);
        for (let i = 1; i <= count; i++) {
          if (token !== tokenRef.current) return;
          const page = await doc.getPage(i);
          const unscaled = page.getViewport({ scale: 1 });
          const scale = Math.min(_MAX_RENDER_SCALE, _TARGET_DEVICE_WIDTH / unscaled.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            page.cleanup();
            continue;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          page.cleanup();
          const url = await canvasToObjectUrl(canvas);
          if (token !== tokenRef.current) {
            URL.revokeObjectURL(url);
            return;
          }
          localUrls.push(url);
          setPages((prev) => [...prev, { index: i, src: url }]);
        }
      } catch (err) {
        if (token === tokenRef.current) {
          setError(err instanceof Error ? err.message : "Could not render preview.");
        }
      } finally {
        if (token === tokenRef.current) setLoading(false);
        doc.cleanup();
        void doc.destroy();
      }
    })().catch((err) => {
      if (token === tokenRef.current) {
        setError(err instanceof Error ? err.message : "Could not render preview.");
        setLoading(false);
      }
    });

    return () => {
      tokenRef.current++;
      revokeAll(localUrls);
    };
  }, [file, maxPages]);

  if (!file) return null;
  if (loading && pages.length === 0) {
    return (
      <div className={cn("flex gap-2 overflow-x-auto", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i.toString()}
            className="h-32 w-24 shrink-0 animate-pulse rounded-md bg-foreground/5"
          />
        ))}
      </div>
    );
  }
  if (error && pages.length === 0) {
    return <p className="text-xs text-muted-foreground">Preview unavailable: {error}</p>;
  }
  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-2", className)}>
      {pages.map((p) => {
        const rotation = rotations?.[p.index] ?? 0;
        const selected = selectedPages?.has(p.index) ?? false;
        const interactive = !!onPageClick;
        const baseClass = cn(
          "relative flex shrink-0 flex-col items-center gap-1 rounded-md border bg-card p-1.5 transition-all",
          interactive && "cursor-pointer hover:border-foreground/30",
          selected ? "border-foreground/60 ring-2 ring-foreground/20" : "border-border",
        );
        return interactive ? (
          <button
            key={p.index}
            type="button"
            onClick={() => onPageClick?.(p.index)}
            className={baseClass}
          >
            <img
              src={p.src}
              alt={`Page ${p.index}`}
              loading="lazy"
              className="h-32 w-24 rounded-sm bg-background object-contain transition-transform"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
            <span className="text-[10px] font-medium text-muted-foreground">{p.index}</span>
          </button>
        ) : (
          <div key={p.index} className={baseClass}>
            <img
              src={p.src}
              alt={`Page ${p.index}`}
              loading="lazy"
              className="h-32 w-24 rounded-sm bg-background object-contain transition-transform"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
            <span className="text-[10px] font-medium text-muted-foreground">{p.index}</span>
          </div>
        );
      })}
    </div>
  );
}
