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

export async function setDocumentPassword(documentId: string, password: string): Promise<void> {
  await apiClient.post(`/documents/${documentId}/password`, { password });
}

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

export type ConvertJobInput = {
  documentId: string;
  idempotencyKey: string;
};

export function useCreateConvertJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConvertJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/convert", {
        document_id: input.documentId,
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

export function useCreatePdfToWordJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConvertJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/pdf-to-word", {
        document_id: input.documentId,
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

type Rgb = [number, number, number];

export type OverlayOp = {
  type: "text" | "image" | "rect" | "line";
  page: number;
  [key: string]: unknown;
};

export type RedactRect = {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

function zr() {
  return useUiStore.getState().zeroRetention;
}

export type ProtectJobInput = {
  documentId: string;
  password: string;
  ownerPassword?: string | null;
  allowPrinting: boolean;
  allowCopying: boolean;
  idempotencyKey: string;
};

export function useCreateProtectJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProtectJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/protect", {
        document_id: input.documentId,
        password: input.password,
        owner_password: input.ownerPassword ?? null,
        allow_printing: input.allowPrinting,
        allow_copying: input.allowCopying,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type UnlockJobInput = {
  documentId: string;
  password: string;
  idempotencyKey: string;
};

export function useCreateUnlockJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnlockJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/unlock", {
        document_id: input.documentId,
        password: input.password,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type WatermarkJobInput = {
  documentId: string;
  text: string;
  color?: Rgb | null;
  opacity: number;
  size: number;
  rotation: number;
  tile: boolean;
  font: string;
  idempotencyKey: string;
};

export function useCreateWatermarkJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WatermarkJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/watermark", {
        document_id: input.documentId,
        text: input.text,
        color: input.color ?? null,
        opacity: input.opacity,
        size: input.size,
        rotation: input.rotation,
        tile: input.tile,
        font: input.font,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type PageNumbersJobInput = {
  documentId: string;
  format: string;
  position: string;
  startAt: number;
  size: number;
  color?: Rgb | null;
  font: string;
  idempotencyKey: string;
};

export function useCreatePageNumbersJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PageNumbersJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/page-numbers", {
        document_id: input.documentId,
        format: input.format,
        position: input.position,
        start_at: input.startAt,
        size: input.size,
        color: input.color ?? null,
        font: input.font,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type CropJobInput = {
  documentId: string;
  box: { x: number; y: number; w: number; h: number };
  pages?: number[] | null;
  idempotencyKey: string;
};

export function useCreateCropJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CropJobInput): Promise<Job> => {
      const body: Record<string, unknown> = {
        document_id: input.documentId,
        box: input.box,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      };
      if (input.pages && input.pages.length > 0) body.pages = input.pages;
      const { data } = await apiClient.post<ApiJob>("/jobs/crop", body);
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type PdfToImagesJobInput = {
  documentId: string;
  imageFormat: "jpeg" | "png";
  dpi: number;
  quality: number;
  idempotencyKey: string;
};

export function useCreatePdfToImagesJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PdfToImagesJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/pdf-to-images", {
        document_id: input.documentId,
        image_format: input.imageFormat,
        dpi: input.dpi,
        quality: input.quality,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type ImagesToPdfJobInput = {
  documentIds: string[];
  pageSize: "auto" | "a4" | "letter";
  idempotencyKey: string;
};

export function useCreateImagesToPdfJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImagesToPdfJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/images-to-pdf", {
        document_ids: input.documentIds,
        page_size: input.pageSize,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type RedactJobInput = {
  documentId: string;
  redactions: RedactRect[];
  dpi: number;
  idempotencyKey: string;
};

export function useCreateRedactJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RedactJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/redact", {
        document_id: input.documentId,
        redactions: input.redactions,
        dpi: input.dpi,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type SignJobInput = {
  documentId: string;
  placements: OverlayOp[];
  idempotencyKey: string;
};

export function useCreateSignJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/sign", {
        document_id: input.documentId,
        images: [],
        placements: input.placements,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export type EditJobInput = {
  documentId: string;
  ops: OverlayOp[];
  idempotencyKey: string;
};

export function useCreateEditJobMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditJobInput): Promise<Job> => {
      const { data } = await apiClient.post<ApiJob>("/jobs/edit", {
        document_id: input.documentId,
        images: [],
        ops: input.ops,
        idempotency_key: input.idempotencyKey,
        zero_retention: zr(),
      });
      return mapJob(data);
    },
    onSuccess: (job) => qc.setQueryData(compressKeys.job(job.id), job),
  });
}

export function _ensureSharedHooksReExport() {
  return { useConfirmUploadMutation, useInitiateUploadMutation };
}
