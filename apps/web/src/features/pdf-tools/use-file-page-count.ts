import { useEffect, useRef, useState } from "react";

export type FilePageCountState = {
  pageCount: number | null;
  loading: boolean;
  error: string | null;
};

export function useFilePageCount(file: File | null): FilePageCountState {
  const [state, setState] = useState<FilePageCountState>({
    pageCount: null,
    loading: false,
    error: null,
  });
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!file) {
      setState({ pageCount: null, loading: false, error: null });
      return;
    }
    const token = ++tokenRef.current;
    setState({ pageCount: null, loading: true, error: null });
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
        const count = doc.numPages;
        doc.destroy();
        setState({ pageCount: count, loading: false, error: null });
      } catch (err) {
        if (token !== tokenRef.current) return;
        setState({
          pageCount: null,
          loading: false,
          error: err instanceof Error ? err.message : "Could not read PDF.",
        });
      }
    })();
  }, [file]);

  return state;
}
