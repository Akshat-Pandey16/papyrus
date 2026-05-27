import type { components } from "./api";

type Schemas = components["schemas"];

export type User = Schemas["UserOut"];
export type Organization = Schemas["OrganizationOut"];
export type AccessToken = Schemas["AccessToken"];
export type AuthSession = Schemas["AuthSession"];
export type SessionInfo = Schemas["SessionOut"];
export type SessionsList = Schemas["SessionsList"];

export type Job = Schemas["JobOut"];
export type JobKind = Job["kind"];
export type JobStatus = Job["status"];
export type JobsListPage = Schemas["JobsListPage"];
export type DownloadUrl = Schemas["DownloadUrlOut"];

export type DocumentInfo = Schemas["DocumentOut"];
export type UploadInitiateRequest = Schemas["UploadInitiateRequest"];
export type UploadInitiateResponse = Schemas["UploadInitiateResponse"];
export type PresignedUpload = Schemas["PresignedUploadOut"];
export type ConfirmUploadRequest = Schemas["ConfirmUploadRequest"];

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    request_id: string | null;
  };
};

export type { components, operations, paths } from "./api";
