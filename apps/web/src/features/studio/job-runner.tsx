import confetti from "canvas-confetti";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useJobStream } from "@/features/pdf-compress/hooks/use-job-stream";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useMergeStore } from "@/features/pdf-merge/store";
import { useDownloadUrlMutation } from "@/features/pdf-tools/api";
import { triggerDownload } from "@/features/pdf-tools/download";
import type { SessionJob } from "@/features/studio/session-jobs";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const CONFETTI_COLORS = ["#E1466A", "#E5379B", "#F0B23C", "#ffffff"];

function celebrate() {
  confetti({
    particleCount: 90,
    spread: 72,
    startVelocity: 38,
    origin: { y: 0.72 },
    colors: CONFETTI_COLORS,
    scalar: 0.9,
    ticks: 130,
    disableForReducedMotion: true,
  });
}

export function JobRunner({ job }: { job: SessionJob }) {
  const stream = useJobStream(job.jobId ?? null);
  const data = stream.data ?? null;
  const updateUpload = useUploadStore((s) => s.update);
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const download = useDownloadUrlMutation();
  const downloadRef = useRef(download);
  downloadRef.current = download;
  const seenRef = useRef(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    const status = data.status;

    if (!seenRef.current) {
      seenRef.current = true;
      // If the job is already finished the first time we observe it (a remount after
      // navigation, or a page reload), it was completed in a previous view — suppress the
      // auto-download + confetti so they only ever fire once, when the job truly completes.
      if (TERMINAL.has(status)) handledRef.current = true;
    }

    const apply = (phase: string, extra?: { errorCode?: string; errorMessage?: string }) => {
      const patch = { phase, ...extra } as Record<string, unknown>;
      if (job.source === "upload") updateUpload(job.key, patch);
      else updateBatch(job.key, patch);
    };

    if (status === "succeeded") apply("succeeded");
    else if (status === "failed")
      apply("failed", {
        errorCode: data.errorCode ?? "internal_error",
        errorMessage: data.errorMessage ?? "Job failed.",
      });
    else if (status === "cancelled") apply("cancelled");
    else if (status === "running") apply("running");
    else if (status === "pending") apply("queued");

    if (status === "succeeded" && !handledRef.current) {
      handledRef.current = true;
      celebrate();
      downloadRef.current
        .mutateAsync({ jobId: data.id })
        .then((r) => triggerDownload(r.url, r.filename))
        .catch(() => toast.error("Your file is ready — open Results to download it."));
    }
  }, [data, job.key, job.source, updateUpload, updateBatch]);

  return null;
}
