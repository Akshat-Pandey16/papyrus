import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { compressKeys, mapJob } from "@/features/pdf-compress/api";
import type { Job, JobStatus, JobsListPage } from "@/features/pdf-merge/types";
import { apiClient } from "@/lib/api/client";

export {
  requestSseTicket,
  useCancelJobMutation,
  useConfirmUploadMutation,
  useDownloadUrlMutation,
  useInitiateUploadMutation,
  useJobQuery,
  useRetryJobMutation,
} from "@/features/pdf-compress/api";

export const mergeKeys = {
  all: ["merge"] as const,
  job: (id: string) => [...mergeKeys.all, "job", id] as const,
  jobsList: (filters: { status?: JobStatus | "all" }) =>
    [...mergeKeys.all, "jobs", filters] as const,
};

type ApiJob = Parameters<typeof mapJob>[0];

type ApiJobsList = {
  items: ApiJob[];
  next_cursor: string | null;
};

export type CreateMergeJobInput = {
  documentIds: string[];
  idempotencyKey: string;
};

export function useCreateMergeJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMergeJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/merge", {
        document_ids: input.documentIds,
        idempotency_key: input.idempotencyKey,
      });
      return mapJob(data);
    },
    onSuccess: (job) => {
      qc.setQueryData(compressKeys.job(job.id), job);
      qc.invalidateQueries({ queryKey: mergeKeys.all });
    },
  });
}

export type MergeJobsListFilters = { status?: JobStatus | "all" };

export function useMergeJobsInfiniteQuery(filters: MergeJobsListFilters) {
  return useInfiniteQuery<
    JobsListPage,
    Error,
    InfiniteData<JobsListPage>,
    ReadonlyArray<unknown>,
    string | null
  >({
    queryKey: mergeKeys.jobsList(filters),
    initialPageParam: null,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam }): Promise<JobsListPage> => {
      const params = new URLSearchParams({ kind: "merge", limit: "20" });
      if (filters.status && filters.status !== "all") {
        params.set("status", filters.status);
      }
      if (typeof pageParam === "string" && pageParam.length > 0) {
        params.set("cursor", pageParam);
      }
      const { data } = await apiClient.get<ApiJobsList>(`/jobs?${params.toString()}`);
      return {
        items: data.items.map(mapJob),
        nextCursor: data.next_cursor,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
