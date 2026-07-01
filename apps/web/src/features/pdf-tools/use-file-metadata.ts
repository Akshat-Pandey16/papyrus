import { useEffect, useRef, useState } from "react";
import { getCachedDoc, PARSE_MAX_BYTES } from "@/features/studio/page-canvas";

export type PdfMetadata = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
};

const EMPTY: PdfMetadata = { title: "", author: "", subject: "", keywords: "" };

export function useFileMetadata(file: File | null): { metadata: PdfMetadata; loading: boolean } {
  const [metadata, setMetadata] = useState<PdfMetadata>(EMPTY);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!file || file.size > PARSE_MAX_BYTES) {
      setMetadata(EMPTY);
      setLoading(false);
      return;
    }
    const token = ++tokenRef.current;
    setLoading(true);
    getCachedDoc(file)
      .then((doc) => doc.getMetadata())
      .then((meta) => {
        if (token !== tokenRef.current) return;
        const info = (meta?.info ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        setMetadata({
          title: str(info.Title),
          author: str(info.Author),
          subject: str(info.Subject),
          keywords: str(info.Keywords),
        });
        setLoading(false);
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        setMetadata(EMPTY);
        setLoading(false);
      });
  }, [file]);

  return { metadata, loading };
}
