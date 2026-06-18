import { useAuthStore } from "@/features/auth/store";
import { JobRunner } from "@/features/studio/job-runner";
import { isActivePhase, useSessionJobs } from "@/features/studio/session-jobs";

export function ResultsHost() {
  const hasAccess = useAuthStore((s) => s.hasAccess);
  const jobs = useSessionJobs();
  if (!hasAccess) return null;
  return (
    <>
      {jobs
        .filter((j) => j.jobId && isActivePhase(j.phase))
        .map((j) => (
          <JobRunner key={j.key} job={j} />
        ))}
    </>
  );
}
