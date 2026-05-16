import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { compressKeys, mapJob } from "@/features/pdf-compress/api";
import type { CompressionOptions } from "@/features/pdf-compress/types";
import type {
  Job,
  JobStatus,
  JobsListPage,
  MergeInput,
  MergeOptions,
} from "@/features/pdf-merge/types";
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

function compressOptionsToApi(options: CompressionOptions) {
  return {
    engine: options.engine,
    recompress_images: options.recompressImages,
    image_quality: options.imageQuality,
    image_max_dimension: options.imageMaxDimension,
    color_mode: options.colorMode,
    recompress_streams: options.recompressStreams,
    object_stream_mode: options.objectStreamMode,
    strip_metadata: options.stripMetadata,
    discard_javascript: options.discardJavascript,
    discard_forms: options.discardForms,
    discard_annotations: options.discardAnnotations,
    discard_bookmarks: options.discardBookmarks,
    discard_attachments: options.discardAttachments,
    discard_thumbnails: options.discardThumbnails,
    linearize: options.linearize,
    pdf_version: options.pdfVersion,
  };
}

function mergeOptionsToApi(options: MergeOptions) {
  return {
    add_filename_bookmarks: options.addFilenameBookmarks,
    blank_pages_between: options.blankPagesBetween,
    strip_metadata: options.stripMetadata,
    linearize: options.linearize,
    pdf_version: options.pdfVersion,
    ...(options.compress ? { compress: compressOptionsToApi(options.compress) } : {}),
  };
}

export type CreateMergeJobInput = {
  inputs: MergeInput[];
  idempotencyKey: string;
  options?: MergeOptions;
};

export function useCreateMergeJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMergeJobInput): Promise<Job> => {
      const body: Record<string, unknown> = {
        inputs: input.inputs.map((spec) => ({
          document_id: spec.documentId,
          page_ranges: spec.pageRanges,
        })),
        idempotency_key: input.idempotencyKey,
      };
      if (input.options !== undefined) {
        body.options = mergeOptionsToApi(input.options);
      }
      const { data } = await apiClient.post<ApiJob>("/jobs/merge", body);
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
