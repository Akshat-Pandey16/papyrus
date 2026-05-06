import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { env } from "@/lib/env";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    request_id: string | null;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details: Record<string, unknown>;
    requestId: string | null;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function attachAuth(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (accessToken && config.headers) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return config;
}

function normalizeError(error: AxiosError<ApiErrorBody>): never {
  if (error.response?.data?.error) {
    const e = error.response.data.error;
    throw new ApiError({
      code: e.code,
      message: e.message,
      status: error.response.status,
      details: e.details,
      requestId: e.request_id,
    });
  }
  throw new ApiError({
    code: "network_error",
    message: error.message,
    status: error.response?.status ?? 0,
    details: {},
    requestId: null,
  });
}

export function createApiClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: `${env.VITE_API_BASE_URL}/api/v1`,
    withCredentials: true,
    timeout: 30_000,
  });
  instance.interceptors.request.use(attachAuth);
  instance.interceptors.response.use((r: any) => r, normalizeError);
  return instance;
}

export const apiClient = createApiClient();
