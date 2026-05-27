import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  compressKeys,
  mapJob,
  useConfirmUploadMutation,
  useInitiateUploadMutation,
} from "@/features/pdf-compress/api";
import type { CompressionOptions, Job, PdfVersion } from "@/features/pdf-compress/types";
import { apiClient } from "@/lib/api/client";
import { useUiStore } from "@/stores/ui-store";

export type SplitMode = "ranges" | "every_n" | "single_pages";

export type SplitRange = { from: number; to: number };

export type SplitOptions = {
  combineIntoSingle: boolean;
  stripMetadata: boolean;
  linearize: boolean;
  pdfVersion: PdfVersion | null;
  compress: CompressionOptions | null;
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

function splitOptionsToApi(options: SplitOptions) {
  return {
    combine_into_single: options.combineIntoSingle,
    strip_metadata: options.stripMetadata,
    linearize: options.linearize,
    pdf_version: options.pdfVersion,
    ...(options.compress ? { compress: compressOptionsToApi(options.compress) } : {}),
  };
}

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
  mode: SplitMode;
  ranges?: SplitRange[];
  everyN?: number;
  options?: SplitOptions;
  idempotencyKey: string;
};

export function useCreateSplitJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SplitJobInput): Promise<Job> => {
      const body: Record<string, unknown> = {
        document_id: input.documentId,
        mode: input.mode,
        idempotency_key: input.idempotencyKey,
        zero_retention: useUiStore.getState().zeroRetention,
      };
      if (input.ranges) {
        body.ranges = input.ranges.map((r) => ({ from: r.from, to: r.to }));
      }
      if (input.everyN !== undefined) {
        body.every_n = input.everyN;
      }
      if (input.options) {
        body.options = splitOptionsToApi(input.options);
      }
      const { data } = await apiClient.post<ApiJob>("/jobs/split", body);
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
        zero_retention: useUiStore.getState().zeroRetention,
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
        zero_retention: useUiStore.getState().zeroRetention,
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
        zero_retention: useUiStore.getState().zeroRetention,
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
