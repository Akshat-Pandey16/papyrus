import { useMemo } from "react";
import { useUploadStore } from "@/features/pdf-compress/store";
import type { JobKind } from "@/features/pdf-compress/types";
import { useMergeStore } from "@/features/pdf-merge/store";

export type SessionJobSource = "upload" | "merge";

export type SessionJob = {
  key: string;
  source: SessionJobSource;
  jobId: string | undefined;
  kind: JobKind;
  title: string;
  sizeBytes: number | undefined;
  fileCount: number;
  phase: string;
  createdAt: number;
  errorCode: string | undefined;
  errorMessage: string | undefined;
};

const ACTIVE_PHASES = new Set([
  "preparing",
  "uploading",
  "uploaded",
  "queued",
  "running",
  "pending",
]);

export function isActivePhase(phase: string): boolean {
  return ACTIVE_PHASES.has(phase);
}

export function useSessionJobs(): SessionJob[] {
  const uploads = useUploadStore((s) => s.uploads);
  const batches = useMergeStore((s) => s.batches);

  return useMemo(() => {
    const list: SessionJob[] = [];
    for (const e of Object.values(uploads)) {
      list.push({
        key: e.clientUploadId,
        source: "upload",
        jobId: e.jobId,
        kind: e.kind as JobKind,
        title: e.fileName,
        sizeBytes: e.fileSize,
        fileCount: 1,
        phase: e.phase,
        createdAt: e.createdAt,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
      });
    }
    for (const b of Object.values(batches)) {
      const totalSize = b.files.reduce((sum, f) => sum + f.fileSize, 0);
      const first = b.files[0]?.fileName ?? "Merge";
      const title = b.files.length > 1 ? `${first} + ${b.files.length - 1} more` : first;
      list.push({
        key: b.clientBatchId,
        source: "merge",
        jobId: b.jobId,
        kind: "merge",
        title,
        sizeBytes: totalSize,
        fileCount: b.files.length,
        phase: b.phase,
        createdAt: b.createdAt,
        errorCode: b.errorCode,
        errorMessage: b.errorMessage,
      });
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [uploads, batches]);
}
