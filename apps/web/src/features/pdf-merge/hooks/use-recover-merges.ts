import { useEffect, useRef } from "react";
import { useMergeStore } from "@/features/pdf-merge/store";

export function useRecoverMerges() {
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const updateFile = useMergeStore((s) => s.updateFile);
  const clearStale = useMergeStore((s) => s.clearStale);
  const recoveredRef = useRef(false);

  useEffect(() => {
    if (recoveredRef.current) return;
    recoveredRef.current = true;

    clearStale();

    const snapshot = useMergeStore.getState().batches;
    for (const batch of Object.values(snapshot)) {
      if (batch.jobId) continue;
      const anyInFlight = batch.files.some(
        (f) => !f.documentId && (f.phase === "preparing" || f.phase === "uploading"),
      );
      if (!anyInFlight) continue;
      for (const f of batch.files) {
        if (!f.documentId && (f.phase === "preparing" || f.phase === "uploading")) {
          updateFile(batch.clientBatchId, f.clientFileId, {
            phase: "failed",
            errorCode: "upload_lost",
            errorMessage: "We lost your upload. Please pick the files again.",
          });
        }
      }
      updateBatch(batch.clientBatchId, {
        phase: "failed",
        errorCode: "upload_lost",
        errorMessage: "We lost your upload. Please pick the files again.",
      });
    }
  }, [updateBatch, updateFile, clearStale]);
}
