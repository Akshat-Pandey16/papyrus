import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  compressKeys,
  mapJob,
  useConfirmUploadMutation,
  useInitiateUploadMutation,
} from "@/features/pdf-compress/api";
import type { Job } from "@/features/pdf-compress/types";
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

type ApiJob = Parameters<typeof mapJob>[0];

export type SplitJobInput = {
  documentId: string;
  ranges: string;
  idempotencyKey: string;
};

export function useCreateSplitJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SplitJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/split", {
        document_id: input.documentId,
        ranges: input.ranges,
        idempotency_key: input.idempotencyKey,
      });
      return mapJob(data);
    },
    onSuccess: (job) => {
      qc.setQueryData(compressKeys.job(job.id), job);
    },
  });
}

export type RotateJobInput = {
  documentId: string;
  rotations: Record<string, number>;
  idempotencyKey: string;
};

export function useCreateRotateJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RotateJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/rotate", {
        document_id: input.documentId,
        rotations: input.rotations,
        idempotency_key: input.idempotencyKey,
      });
      return mapJob(data);
    },
    onSuccess: (job) => {
      qc.setQueryData(compressKeys.job(job.id), job);
    },
  });
}

export type ReorderJobInput = {
  documentId: string;
  order: number[];
  idempotencyKey: string;
};

export function useCreateReorderJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/reorder", {
        document_id: input.documentId,
        order: input.order,
        idempotency_key: input.idempotencyKey,
      });
      return mapJob(data);
    },
    onSuccess: (job) => {
      qc.setQueryData(compressKeys.job(job.id), job);
    },
  });
}

export type OcrJobInput = {
  documentId: string;
  language: string;
  idempotencyKey: string;
};

export function useCreateOcrJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OcrJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/ocr", {
        document_id: input.documentId,
        language: input.language,
        idempotency_key: input.idempotencyKey,
      });
      return mapJob(data);
    },
    onSuccess: (job) => {
      qc.setQueryData(compressKeys.job(job.id), job);
    },
  });
}

export function _ensureSharedHooksReExport() {
  return { useConfirmUploadMutation, useInitiateUploadMutation };
}
