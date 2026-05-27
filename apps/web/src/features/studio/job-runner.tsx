import confetti from "canvas-confetti";
import { useEffect, useRef } from "react";
import { useJobStream } from "@/features/pdf-compress/hooks/use-job-stream";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useMergeStore } from "@/features/pdf-merge/store";
import { useAutoDownload } from "@/features/pdf-tools/use-auto-download";
import type { SessionJob } from "@/features/studio/session-jobs";

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
  useAutoDownload(data);
  const updateUpload = useUploadStore((s) => s.update);
  const updateBatch = useMergeStore((s) => s.updateBatch);
  const celebrated = useRef(false);

  useEffect(() => {
    if (!data) return;
    const apply = (phase: string, extra?: { errorCode?: string; errorMessage?: string }) => {
      const patch = { phase, ...extra } as Record<string, unknown>;
      if (job.source === "upload") updateUpload(job.key, patch);
      else updateBatch(job.key, patch);
    };
    if (data.status === "succeeded") {
      apply("succeeded");
      if (!celebrated.current) {
        celebrated.current = true;
        celebrate();
      }
    } else if (data.status === "failed") {
      apply("failed", {
        errorCode: data.errorCode ?? "internal_error",
        errorMessage: data.errorMessage ?? "Job failed.",
      });
    } else if (data.status === "cancelled") {
      apply("cancelled");
    } else if (data.status === "running") {
      apply("running");
    } else if (data.status === "pending") {
      apply("queued");
    }
  }, [data, job.key, job.source, updateUpload, updateBatch]);

  return null;
}
