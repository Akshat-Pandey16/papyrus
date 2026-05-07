import { useCallback, useEffect, useRef } from "react";
import { useConfirmUploadMutation, useInitiateUploadMutation } from "@/features/pdf-merge/api";
import { useMergeStore } from "@/features/pdf-merge/store";

const xhrRegistry = new Map<string, XMLHttpRequest>();

export type MergeUploadInput = {
  clientBatchId: string;
  files: Array<{ clientFileId: string; file: File }>;
};

export type MergeUploadResult = {
  documentIds: string[];
};

function xhrKey(batchId: string, fileId: string): string {
  return `${batchId}::${fileId}`;
}

export function useMergeUpload() {
  const initiate = useInitiateUploadMutation();
  const confirm = useConfirmUploadMutation();
  const updateFile = useMergeStore((s) => s.updateFile);
  const cancelledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const xhr of xhrRegistry.values()) {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
      }
      xhrRegistry.clear();
    };
  }, []);

  const uploadOne = useCallback(
    async (batchId: string, clientFileId: string, file: File): Promise<string> => {
      updateFile(batchId, clientFileId, { phase: "preparing" });

      const init = await initiate.mutateAsync({
        name: file.name,
        contentType: "application/pdf",
        sizeBytes: file.size,
      });

      updateFile(batchId, clientFileId, {
        phase: "uploading",
        documentId: init.documentId,
        bytesTotal: file.size,
        bytesUploaded: 0,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const key = xhrKey(batchId, clientFileId);
        xhrRegistry.set(key, xhr);

        xhr.upload.addEventListener("progress", (e: ProgressEvent) => {
          if (e.lengthComputable) {
            updateFile(batchId, clientFileId, { bytesUploaded: e.loaded });
          }
        });

        xhr.addEventListener("load", () => {
          xhrRegistry.delete(key);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
          }
        });
        xhr.addEventListener("error", () => {
          xhrRegistry.delete(key);
          reject(new Error("Network error during upload."));
        });
        xhr.addEventListener("abort", () => {
          xhrRegistry.delete(key);
          reject(new Error("Upload cancelled."));
        });

        const form = new FormData();
        for (const [k, v] of Object.entries(init.upload.fields)) {
          form.append(k, v);
        }
        form.append("file", file);

        xhr.open("POST", init.upload.url);
        xhr.send(form);
      });

      if (cancelledRef.current.has(batchId)) {
        throw new Error("Upload cancelled.");
      }

      updateFile(batchId, clientFileId, { phase: "uploaded" });
      await confirm.mutateAsync({ documentId: init.documentId });
      return init.documentId;
    },
    [initiate, confirm, updateFile],
  );

  const start = useCallback(
    async ({ clientBatchId, files }: MergeUploadInput): Promise<MergeUploadResult> => {
      cancelledRef.current.delete(clientBatchId);
      const documentIds = await Promise.all(
        files.map(({ clientFileId, file }) => uploadOne(clientBatchId, clientFileId, file)),
      );
      return { documentIds };
    },
    [uploadOne],
  );

  const cancel = useCallback((clientBatchId: string) => {
    cancelledRef.current.add(clientBatchId);
    for (const [key, xhr] of xhrRegistry.entries()) {
      if (key.startsWith(`${clientBatchId}::`)) {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
        xhrRegistry.delete(key);
      }
    }
  }, []);

  return { start, cancel };
}
