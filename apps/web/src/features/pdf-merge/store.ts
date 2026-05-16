import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MergeFilePhase =
  | "pending"
  | "preparing"
  | "uploading"
  | "uploaded"
  | "failed"
  | "cancelled";

export type MergeBatchPhase =
  | "idle"
  | "uploading"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type MergeFileEntry = {
  clientFileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  documentId?: string;
  pageRanges?: string | null;
  phase: MergeFilePhase;
  bytesUploaded: number;
  bytesTotal: number;
  errorCode?: string;
  errorMessage?: string;
};

export type MergeBatch = {
  clientBatchId: string;
  idempotencyKey: string;
  files: MergeFileEntry[];
  jobId?: string;
  phase: MergeBatchPhase;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
};

type MergeState = {
  batches: Record<string, MergeBatch>;
  start: (batch: MergeBatch) => void;
  updateBatch: (id: string, patch: Partial<MergeBatch>) => void;
  updateFile: (batchId: string, fileId: string, patch: Partial<MergeFileEntry>) => void;
  remove: (id: string) => void;
  clearStale: (olderThanMs?: number) => void;
};

const STALE_DEFAULT_MS = 24 * 60 * 60 * 1000;

export const useMergeStore = create<MergeState>()(
  persist(
    (set, get) => ({
      batches: {},
      start: (batch) => {
        set((state) => ({
          batches: { ...state.batches, [batch.clientBatchId]: batch },
        }));
      },
      updateBatch: (id, patch) => {
        const current = get().batches[id];
        if (!current) return;
        const next: MergeBatch = { ...current, ...patch };
        set((state) => ({
          batches: { ...state.batches, [id]: next },
        }));
      },
      updateFile: (batchId, fileId, patch) => {
        const current = get().batches[batchId];
        if (!current) return;
        const files = current.files.map((f) =>
          f.clientFileId === fileId ? { ...f, ...patch } : f,
        );
        set((state) => ({
          batches: { ...state.batches, [batchId]: { ...current, files } },
        }));
      },
      remove: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.batches;
          return { batches: rest };
        });
      },
      clearStale: (olderThanMs) => {
        const cutoff = Date.now() - (olderThanMs ?? STALE_DEFAULT_MS);
        set((state) => {
          const next: Record<string, MergeBatch> = {};
          for (const [id, batch] of Object.entries(state.batches)) {
            if (batch.createdAt >= cutoff) next[id] = batch;
          }
          return { batches: next };
        });
      },
    }),
    {
      name: "papyrus.merge.v1",
      partialize: (s) => ({ batches: s.batches }),
      version: 1,
    },
  ),
);

export function selectBatch(id: string) {
  return (s: MergeState) => s.batches[id];
}
