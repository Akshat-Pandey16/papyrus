import { useEffect, useRef, useState } from "react";
import { useSessionJobs } from "@/features/studio/session-jobs";
import { TOOLS } from "@/features/studio/tools";
import type { ToolId } from "@/features/studio/types";
import { mapErrorMessage } from "@/lib/api/error-message";

function labelFor(kind: string): string {
  const tool = TOOLS[kind as ToolId];
  return tool ? tool.label : "Your file";
}

export function JobAnnouncer() {
  const jobs = useSessionJobs();
  const [message, setMessage] = useState("");
  const seen = useRef(new Map<string, string>());

  useEffect(() => {
    let next: string | null = null;
    for (const job of jobs) {
      const last = seen.current.get(job.key);
      if (last === job.phase) continue;
      seen.current.set(job.key, job.phase);
      if (last === undefined) continue;
      if (job.phase === "succeeded") {
        next = `${labelFor(job.kind)} is ready and downloading.`;
      } else if (job.phase === "failed") {
        next = `${labelFor(job.kind)} failed. ${mapErrorMessage(job.errorCode, job.errorMessage)}`;
      } else if (job.phase === "cancelled") {
        next = `${labelFor(job.kind)} was cancelled.`;
      }
    }
    if (next) setMessage(next);
  }, [jobs]);

  return (
    <div aria-live="polite" role="status" className="sr-only">
      {message}
    </div>
  );
}
