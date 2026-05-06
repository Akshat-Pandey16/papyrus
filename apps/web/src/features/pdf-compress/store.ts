import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CompressionLevel } from "@/features/pdf-compress/types";

export type UploadPhase =
  | "idle"
  | "preparing"
  | "uploading"
  | "uploaded"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type UploadEntry = {
  clientUploadId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  level: CompressionLevel;
  idempotencyKey: string;
  documentId?: string;
  jobId?: string;
  phase: UploadPhase;
  bytesUploaded: number;
  bytesTotal: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
};

type UploadState = {
  uploads: Record<string, UploadEntry>;
  start: (entry: UploadEntry) => void;
  update: (id: string, patch: Partial<UploadEntry>) => void;
  remove: (id: string) => void;
  clearStale: (olderThanMs?: number) => void;
};

const STALE_DEFAULT_MS = 24 * 60 * 60 * 1000;

export const useUploadStore = create<UploadState>()(
  persist(
    (set, get) => ({
      uploads: {},
      start: (entry) => {
        set((state) => ({
          uploads: { ...state.uploads, [entry.clientUploadId]: entry },
        }));
      },
      update: (id, patch) => {
        const current = get().uploads[id];
        if (!current) return;
        const next: UploadEntry = { ...current, ...patch };
        set((state) => ({
          uploads: { ...state.uploads, [id]: next },
        }));
      },
      remove: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.uploads;
          return { uploads: rest };
        });
      },
      clearStale: (olderThanMs) => {
        const cutoff = Date.now() - (olderThanMs ?? STALE_DEFAULT_MS);
        set((state) => {
          const next: Record<string, UploadEntry> = {};
          for (const [id, entry] of Object.entries(state.uploads)) {
            if (entry.createdAt >= cutoff) next[id] = entry;
          }
          return { uploads: next };
        });
      },
    }),
    {
      name: "papyrus.uploads.v1",
      partialize: (s) => ({ uploads: s.uploads }),
      version: 1,
    },
  ),
);

export function selectUpload(id: string) {
  return (s: UploadState) => s.uploads[id];
}
