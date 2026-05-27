import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Job } from "@/features/pdf-compress/types";
import { useDownloadUrlMutation } from "@/features/pdf-tools/api";
import { triggerDownload } from "@/features/pdf-tools/download";

type DownloadMutation = ReturnType<typeof useDownloadUrlMutation>;

export function useAutoDownload(job: Job | null): DownloadMutation {
  const download = useDownloadUrlMutation();
  const downloadRef = useRef(download);
  downloadRef.current = download;
  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!job || job.status !== "succeeded") return;
    const id = job.id;
    if (triggeredRef.current.has(id)) return;
    triggeredRef.current.add(id);
    downloadRef.current
      .mutateAsync({ jobId: id })
      .then((res) => triggerDownload(res.url, res.filename))
      .catch(() => {
        triggeredRef.current.delete(id);
        toast.error("Your file is ready — tap Download to save it.");
      });
  }, [job]);

  return download;
}
