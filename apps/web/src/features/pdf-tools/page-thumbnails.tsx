import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PageMeta = {
  index: number;
  src: string;
  rotation?: number;
};

export type PageThumbnailsProps = {
  file: File | null;
  maxPages?: number;
  rotations?: Record<number, number>;
  onPageClick?: (pageNumber: number) => void;
  selectedPages?: ReadonlySet<number>;
  className?: string;
};

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

  useEffect(() => {
    if (!file) {
      setPages([]);
      setError(null);
      return;
    }
    const token = ++tokenRef.current;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const data = await file.arrayBuffer();
        if (token !== tokenRef.current) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (token !== tokenRef.current) {
          doc.destroy();
          return;
        }
        const count = Math.min(doc.numPages, maxPages);
        const out: PageMeta[] = [];
        for (let i = 1; i <= count; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 0.4 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          }).promise;
          if (token !== tokenRef.current) {
            doc.destroy();
            return;
          }
          out.push({ index: i, src: canvas.toDataURL("image/png") });
        }
        doc.destroy();
        if (token === tokenRef.current) setPages(out);
      } catch (err) {
        if (token === tokenRef.current) {
          setError(err instanceof Error ? err.message : "Could not render preview.");
        }
      } finally {
        if (token === tokenRef.current) setLoading(false);
      }
    })();
  }, [file, maxPages]);

  if (!file) return null;
  if (loading) {
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
  if (error) {
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
