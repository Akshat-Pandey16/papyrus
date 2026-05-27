import { useCallback, useEffect, useRef } from "react";
import { useConfirmUploadMutation, useInitiateUploadMutation } from "@/features/pdf-compress/api";
import { useUploadStore } from "@/features/pdf-compress/store";

const xhrRegistry = new Map<string, XMLHttpRequest>();

export type UploadStartInput = {
  clientUploadId: string;
  file: File;
};

export type UploadResult = {
  documentId: string;
};

export function usePdfUpload() {
  const initiate = useInitiateUploadMutation();
  const confirm = useConfirmUploadMutation();
  const update = useUploadStore((s) => s.update);
  const cancelledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const xhr of xhrRegistry.values()) {
        try {
          xhr.abort();
        } catch {}
      }
      xhrRegistry.clear();
    };
  }, []);

  const start = useCallback(
    async ({ clientUploadId, file }: UploadStartInput): Promise<UploadResult> => {
      update(clientUploadId, { phase: "preparing" });

      const init = await initiate.mutateAsync({
        name: file.name,
        contentType: "application/pdf",
        sizeBytes: file.size,
      });

      update(clientUploadId, {
        phase: "uploading",
        documentId: init.documentId,
        bytesTotal: file.size,
        bytesUploaded: 0,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRegistry.set(clientUploadId, xhr);

        xhr.upload.addEventListener("progress", (e: ProgressEvent) => {
          if (e.lengthComputable) {
            update(clientUploadId, { bytesUploaded: e.loaded });
          }
        });

        xhr.addEventListener("load", () => {
          xhrRegistry.delete(clientUploadId);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
          }
        });
        xhr.addEventListener("error", () => {
          xhrRegistry.delete(clientUploadId);
          reject(new Error("Network error during upload."));
        });
        xhr.addEventListener("abort", () => {
          xhrRegistry.delete(clientUploadId);
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

      if (cancelledRef.current.has(clientUploadId)) {
        cancelledRef.current.delete(clientUploadId);
        throw new Error("Upload cancelled.");
      }

      update(clientUploadId, { phase: "uploaded" });
      await confirm.mutateAsync({ documentId: init.documentId });
      return { documentId: init.documentId };
    },
    [initiate, confirm, update],
  );

  const cancel = useCallback((clientUploadId: string) => {
    cancelledRef.current.add(clientUploadId);
    const xhr = xhrRegistry.get(clientUploadId);
    if (xhr) {
      try {
        xhr.abort();
      } catch {}
      xhrRegistry.delete(clientUploadId);
    }
  }, []);

  return { start, cancel };
}
