import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import { cn } from "@/lib/utils";

export function FilePreview({ file, className }: { file: File; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    let createdUrl: string | null = null;

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
        const page = await doc.getPage(1);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.min(1, 128 / unscaled.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          page.cleanup();
          const url = await new Promise<string | null>((resolve) => {
            canvas.toBlob(
              (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
              "image/jpeg",
              0.7,
            );
          });
          if (url && token === tokenRef.current) {
            createdUrl = url;
            setSrc(url);
          } else if (url) {
            URL.revokeObjectURL(url);
          }
        }
      } finally {
        doc.cleanup();
        void doc.destroy();
      }
    })().catch(() => undefined);

    return () => {
      tokenRef.current++;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  if (!src) {
    return (
      <div
        className={cn("grid place-items-center bg-foreground/5 text-muted-foreground", className)}
        aria-hidden
      >
        <FileText className="h-4 w-4" />
      </div>
    );
  }
  return <img src={src} alt="" className={cn("object-cover", className)} />;
}
