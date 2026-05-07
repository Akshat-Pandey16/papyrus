import type { Document, DownloadUrl, Job, JobsListPage } from "@/features/pdf-compress/types";

export type {
  Document,
  DocumentVersion,
  DownloadUrl,
  Job,
  JobKind,
  JobStatus,
  JobsListPage,
  PresignedUpload,
  UploadInitiateResult,
} from "@/features/pdf-compress/types";

export type MergeJob = Job;
export type MergeDownloadUrl = DownloadUrl;
export type MergeJobsListPage = JobsListPage;
export type MergeDocument = Document;
