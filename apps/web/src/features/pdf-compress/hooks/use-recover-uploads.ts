import { useEffect, useRef } from "react";
import { useUploadStore } from "@/features/pdf-compress/store";

export function useRecoverUploads() {
  const update = useUploadStore((s) => s.update);
  const clearStale = useUploadStore((s) => s.clearStale);
  const recoveredRef = useRef(false);

  useEffect(() => {
    if (recoveredRef.current) return;
    recoveredRef.current = true;

    clearStale();

    const snapshot = useUploadStore.getState().uploads;
    for (const entry of Object.values(snapshot)) {
      if (!entry.documentId && (entry.phase === "preparing" || entry.phase === "uploading")) {
        update(entry.clientUploadId, {
          phase: "failed",
          errorCode: "upload_lost",
          errorMessage: "We lost your upload. Please pick the file again.",
        });
      }
    }
  }, [update, clearStale]);
}
