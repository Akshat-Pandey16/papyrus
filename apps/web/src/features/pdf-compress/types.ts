export type CompressionLevel = "low" | "medium" | "high" | "extreme" | "custom";

export type ColorMode = "preserve" | "grayscale";

export type ObjectStreamMode = "preserve" | "generate" | "disable";

export type CompressionEngine = "pikepdf" | "ghostscript";

export type PdfVersion = "1.4" | "1.5" | "1.6" | "1.7";

export type CompressionOptions = {
  engine: CompressionEngine;
  recompressImages: boolean;
  imageQuality: number;
  imageMaxDimension: number | null;
  colorMode: ColorMode;
  recompressStreams: boolean;
  objectStreamMode: ObjectStreamMode;
  stripMetadata: boolean;
  discardJavascript: boolean;
  discardForms: boolean;
  discardAnnotations: boolean;
  discardBookmarks: boolean;
  discardAttachments: boolean;
  discardThumbnails: boolean;
  linearize: boolean;
  pdfVersion: PdfVersion | null;
};

export type CompressEstimate = {
  inputSizeBytes: number;
  projectedOutputSizeBytes: number;
  projectedRatio: number;
  projectedSavingsBytes: number;
  totalPageCount: number;
  samplePageCount: number;
  sampleInputSizeBytes: number;
  sampleOutputSizeBytes: number;
  engine: CompressionEngine;
  gsVersion: string | null;
  elapsedMs: number;
};

export type JobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type JobKind =
  | "merge"
  | "split"
  | "compress"
  | "ocr"
  | "convert"
  | "redact"
  | "rotate"
  | "reorder"
  | "sign"
  | "metadata";

export type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  phase: string | null;
  progress: number | null;
  params: Record<string, unknown>;
  documentId: string | null;
  inputSizeBytes: number | null;
  outputSizeBytes: number | null;
  compressionRatio: number | null;
  outputObjectId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type PresignedUpload = {
  url: string;
  fields: Record<string, string>;
  bucket: string;
  key: string;
  expiresAt: string;
};

export type UploadInitiateResult = {
  documentId: string;
  storageObjectId: string;
  upload: PresignedUpload;
  maxBytes: number;
};

export type DocumentVersion = {
  id: string;
  version: number;
  storageObjectId: string;
  sizeBytes: number;
  sha256: string | null;
};

export type Document = {
  id: string;
  name: string;
  mimeType: string;
  pageCount: number | null;
  createdAt: string;
  currentVersion: DocumentVersion | null;
};

export type DownloadUrl = {
  url: string;
  expiresAt: string;
  filename: string;
};

export type JobsListPage = {
  items: Job[];
  nextCursor: string | null;
};
