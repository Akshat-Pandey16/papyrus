export type CompressionLevel = "low" | "medium" | "high";

export type JobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

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
