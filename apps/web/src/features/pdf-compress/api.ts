import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CompressionLevel,
  Document,
  DownloadUrl,
  Job,
  JobKind,
  JobStatus,
  JobsListPage,
  UploadInitiateResult,
} from "@/features/pdf-compress/types";
import { apiClient } from "@/lib/api/client";

type ApiPresigned = {
  url: string;
  fields: Record<string, string>;
  bucket: string;
  key: string;
  expires_at: string;
};

type ApiUploadInitiate = {
  document_id: string;
  storage_object_id: string;
  upload: ApiPresigned;
  max_bytes: number;
};

type ApiDocumentVersion = {
  id: string;
  version: number;
  storage_object_id: string;
  size_bytes: number;
  sha256: string | null;
};

type ApiDocument = {
  id: string;
  name: string;
  mime_type: string;
  page_count: number | null;
  created_at: string;
  current_version: ApiDocumentVersion | null;
};

type ApiJob = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  phase: string | null;
  progress: number | null;
  params: Record<string, unknown>;
  document_id: string | null;
  input_size_bytes: number | null;
  output_size_bytes: number | null;
  compression_ratio: number | null;
  output_object_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type ApiDownloadUrl = {
  url: string;
  expires_at: string;
  filename: string;
};

type ApiJobsList = {
  items: ApiJob[];
  next_cursor: string | null;
};

export function mapJob(j: ApiJob): Job {
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    phase: j.phase,
    progress: j.progress,
    params: j.params,
    documentId: j.document_id,
    inputSizeBytes: j.input_size_bytes,
    outputSizeBytes: j.output_size_bytes,
    compressionRatio: j.compression_ratio,
    outputObjectId: j.output_object_id,
    errorCode: j.error_code,
    errorMessage: j.error_message,
    createdAt: j.created_at,
    startedAt: j.started_at,
    finishedAt: j.finished_at,
  };
}

function mapDocument(d: ApiDocument): Document {
  return {
    id: d.id,
    name: d.name,
    mimeType: d.mime_type,
    pageCount: d.page_count,
    createdAt: d.created_at,
    currentVersion: d.current_version
      ? {
          id: d.current_version.id,
          version: d.current_version.version,
          storageObjectId: d.current_version.storage_object_id,
          sizeBytes: d.current_version.size_bytes,
          sha256: d.current_version.sha256,
        }
      : null,
  };
}

export const compressKeys = {
  all: ["compress"] as const,
  document: (id: string) => [...compressKeys.all, "document", id] as const,
  job: (id: string) => [...compressKeys.all, "job", id] as const,
  jobsList: (filters: { status?: JobStatus | "all" }) =>
    [...compressKeys.all, "jobs", filters] as const,
  downloadUrl: (jobId: string) => [...compressKeys.all, "download", jobId] as const,
};

export type InitiateUploadInput = {
  name: string;
  contentType: "application/pdf";
  sizeBytes: number;
};

export function useInitiateUploadMutation() {
  return useMutation({
    mutationFn: async (input: InitiateUploadInput): Promise<UploadInitiateResult> => {
      const { data } = await apiClient.post<ApiUploadInitiate>("/documents/uploads", {
        name: input.name,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
      });
      return {
        documentId: data.document_id,
        storageObjectId: data.storage_object_id,
        upload: {
          url: data.upload.url,
          fields: data.upload.fields,
          bucket: data.upload.bucket,
          key: data.upload.key,
          expiresAt: data.upload.expires_at,
        },
        maxBytes: data.max_bytes,
      };
    },
  });
}

export function useConfirmUploadMutation() {
  return useMutation({
    mutationFn: async (input: { documentId: string }): Promise<Document> => {
      const { data } = await apiClient.post<ApiDocument>(
        `/documents/uploads/${input.documentId}/confirm`,
        {},
      );
      return mapDocument(data);
    },
  });
}

export type CreateCompressionJobInput = {
  documentId: string;
  compressionLevel: CompressionLevel;
  idempotencyKey: string;
};

export function useCreateCompressionJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCompressionJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/compress", {
        document_id: input.documentId,
        compression_level: input.compressionLevel,
        idempotency_key: input.idempotencyKey,
      });
      return mapJob(data);
    },
    onSuccess: (job) => {
      qc.setQueryData(compressKeys.job(job.id), job);
      qc.invalidateQueries({ queryKey: compressKeys.all });
    },
  });
}

export function useJobQuery(jobId: string | null, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: jobId ? compressKeys.job(jobId) : ["compress", "job", "_"],
    enabled: !!jobId,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
    refetchInterval: options?.refetchInterval ?? false,
    queryFn: async (): Promise<Job> => {
      const { data } = await apiClient.get<ApiJob>(`/jobs/${jobId}`);
      return mapJob(data);
    },
  });
}

export function useDownloadUrlMutation() {
  return useMutation({
    mutationFn: async (input: { jobId: string }): Promise<DownloadUrl> => {
      const { data } = await apiClient.post<ApiDownloadUrl>(`/jobs/${input.jobId}/download`);
      return {
        url: data.url,
        expiresAt: data.expires_at,
        filename: data.filename,
      };
    },
  });
}

export function useCancelJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { jobId: string }): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>(`/jobs/${input.jobId}/cancel`);
      return mapJob(data);
    },
    onSuccess: (job) => {
      qc.setQueryData(compressKeys.job(job.id), job);
    },
  });
}

export type JobsListFilters = { status?: JobStatus | "all" };

export function useJobsInfiniteQuery(filters: JobsListFilters) {
  return useInfiniteQuery<
    JobsListPage,
    Error,
    InfiniteData<JobsListPage>,
    ReadonlyArray<unknown>,
    string | null
  >({
    queryKey: compressKeys.jobsList(filters),
    initialPageParam: null,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam }): Promise<JobsListPage> => {
      const params = new URLSearchParams({ kind: "compress", limit: "20" });
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

export async function requestSseTicket(jobId: string): Promise<void> {
  await apiClient.post(`/jobs/${jobId}/events/ticket`, {});
}
