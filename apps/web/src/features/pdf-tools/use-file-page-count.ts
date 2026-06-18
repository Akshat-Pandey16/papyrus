import { useEffect, useRef, useState } from "react";
import { getCachedDoc, PARSE_MAX_BYTES } from "@/features/studio/page-canvas";

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
    if (file.size > PARSE_MAX_BYTES) {
      setState({ pageCount: null, loading: false, error: null });
      return;
    }
    const token = ++tokenRef.current;
    setState({ pageCount: null, loading: true, error: null });
    getCachedDoc(file)
      .then((doc) => {
        if (token !== tokenRef.current) return;
        setState({ pageCount: doc.numPages, loading: false, error: null });
      })
      .catch((err) => {
        if (token !== tokenRef.current) return;
        setState({
          pageCount: null,
          loading: false,
          error: err instanceof Error ? err.message : "Could not read PDF.",
        });
      });
  }, [file]);

  return state;
}
