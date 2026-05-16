import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { mapJob } from "@/features/pdf-compress/api";
import type { Job, JobKind, JobStatus, JobsListPage } from "@/features/pdf-compress/types";
import { apiClient } from "@/lib/api/client";

type ApiJob = Parameters<typeof mapJob>[0];

type ApiJobsList = {
  items: ApiJob[];
  next_cursor: string | null;
};

export type JobsFeedFilters = {
  kind?: JobKind | "all";
  status?: JobStatus | "all";
};

const jobsFeedKey = (filters: JobsFeedFilters) => ["jobs-feed", filters] as const;

export function useJobsFeedQuery(filters: JobsFeedFilters = {}) {
  return useInfiniteQuery<
    JobsListPage,
    Error,
    InfiniteData<JobsListPage>,
    ReadonlyArray<unknown>,
    string | null
  >({
    queryKey: jobsFeedKey(filters),
    initialPageParam: null,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam }): Promise<JobsListPage> => {
      const params = new URLSearchParams({ limit: "20" });
      if (filters.kind && filters.kind !== "all") params.set("kind", filters.kind);
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (typeof pageParam === "string" && pageParam.length > 0) params.set("cursor", pageParam);
      const { data } = await apiClient.get<ApiJobsList>(`/jobs?${params.toString()}`);
      return { items: data.items.map(mapJob), nextCursor: data.next_cursor };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useInvalidateJobsFeed() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["jobs-feed"] });
}

export function jobDisplayName(job: Job): string {
  const params = job.params as Record<string, unknown>;
  const single = params.input_filename;
  if (typeof single === "string") return single;
  const names = params.input_filenames;
  if (Array.isArray(names) && typeof names[0] === "string") {
    const extra = names.length > 1 ? ` + ${names.length - 1} more` : "";
    return `${names[0]}${extra}`;
  }
  return "Untitled.pdf";
}
