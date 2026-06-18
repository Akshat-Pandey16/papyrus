import type { ErrorEnvelope } from "@papyrus/shared-types";
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { env } from "@/lib/env";

export type ApiErrorBody = ErrorEnvelope;

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

const EXP_SKEW_SECONDS = 30;

type AccessSnapshot = { token: string; expiresAt: number } | null;

let accessSnapshot: AccessSnapshot = null;

function decodeJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadB64 = parts[1] ?? "";
    const padded = payloadB64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadB64.length / 4) * 4, "=");
    const json = atob(padded);
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null, expiresInSeconds?: number) {
  if (!token) {
    accessSnapshot = null;
    return;
  }
  const exp = decodeJwtExp(token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    exp ?? (typeof expiresInSeconds === "number" ? now + expiresInSeconds : now + 900);
  accessSnapshot = { token, expiresAt };
}

export function getAccessToken(): string | null {
  return accessSnapshot?.token ?? null;
}

export function isAccessTokenValid(): boolean {
  if (!accessSnapshot) return false;
  return accessSnapshot.expiresAt - EXP_SKEW_SECONDS > Math.floor(Date.now() / 1000);
}

let refreshHandler: (() => Promise<string | null>) | null = null;
let inflightRefresh: Promise<string | null> | null = null;

export function registerRefreshHandler(fn: (() => Promise<string | null>) | null) {
  refreshHandler = fn;
}

async function refreshAccess(): Promise<string | null> {
  if (!refreshHandler) return null;
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = refreshHandler().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

const AUTH_REFRESH_PATHS = ["/auth/refresh", "/auth/session", "/auth/anonymous"];

function isAuthRefreshPath(url: string): boolean {
  return AUTH_REFRESH_PATHS.some((p) => url.includes(p));
}

async function attachAuth(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
  const cfg = config as InternalAxiosRequestConfig & { _skipAuthRetry?: boolean };
  const url = cfg.url ?? "";
  if (!cfg._skipAuthRetry && !isAuthRefreshPath(url) && getAccessToken() && !isAccessTokenValid()) {
    await refreshAccess();
  }
  const token = getAccessToken();
  if (token && cfg.headers) {
    cfg.headers.set("Authorization", `Bearer ${token}`);
  }
  return cfg;
}

type RetriableConfig = AxiosRequestConfig & {
  _retry?: boolean;
  _skipAuthRetry?: boolean;
  _allowReplay?: boolean;
};

function toApiError(error: AxiosError<ApiErrorBody>): ApiError {
  if (error.response?.data?.error) {
    const e = error.response.data.error;
    return new ApiError({
      code: e.code,
      message: e.message,
      status: error.response.status,
      details: e.details,
      requestId: e.request_id,
    });
  }
  return new ApiError({
    code: "network_error",
    message: error.message || "Network error",
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

  instance.interceptors.response.use(
    (r) => r,
    async (error: AxiosError<ApiErrorBody>) => {
      const original = (error.config ?? {}) as RetriableConfig;
      const status = error.response?.status;
      const method = (original.method ?? "get").toLowerCase();
      const isSafe = method === "get" || method === "head" || method === "options";

      if (
        status === 401 &&
        !original._retry &&
        !original._skipAuthRetry &&
        refreshHandler &&
        (isSafe || original._allowReplay === true)
      ) {
        original._retry = true;
        const newToken = await refreshAccess();
        if (newToken) {
          original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
          return instance.request(original);
        }
      }
      throw toApiError(error);
    },
  );

  return instance;
}

export const apiClient = createApiClient();
