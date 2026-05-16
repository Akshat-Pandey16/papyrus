import type {
  CompressionOptions,
  Document,
  DownloadUrl,
  Job,
  JobsListPage,
  PdfVersion,
} from "@/features/pdf-compress/types";

export type {
  Document,
  DocumentVersion,
  DownloadUrl,
  Job,
  JobKind,
  JobStatus,
  JobsListPage,
  PdfVersion,
  PresignedUpload,
  UploadInitiateResult,
} from "@/features/pdf-compress/types";

export type MergeJob = Job;
export type MergeDownloadUrl = DownloadUrl;
export type MergeJobsListPage = JobsListPage;
export type MergeDocument = Document;

export type MergeInput = {
  documentId: string;
  pageRanges: string | null;
};

export type MergeOptions = {
  addFilenameBookmarks: boolean;
  blankPagesBetween: number;
  stripMetadata: boolean;
  linearize: boolean;
  pdfVersion: PdfVersion | null;
  compress: CompressionOptions | null;
};
