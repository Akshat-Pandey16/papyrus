import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
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

const ACCESS_KEY = "papyrus.access_token";
const ACCESS_EXP_KEY = "papyrus.access_exp";
const EXP_SKEW_SECONDS = 30;

type AccessSnapshot = { token: string; expiresAt: number } | null;

let accessSnapshot: AccessSnapshot = readSnapshot();

function readSnapshot(): AccessSnapshot {
  try {
    const token = sessionStorage.getItem(ACCESS_KEY);
    const expRaw = sessionStorage.getItem(ACCESS_EXP_KEY);
    if (!token || !expRaw) return null;
    const expiresAt = Number.parseInt(expRaw, 10);
    if (!Number.isFinite(expiresAt)) return null;
    return { token, expiresAt };
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: AccessSnapshot) {
  try {
    if (snapshot) {
      sessionStorage.setItem(ACCESS_KEY, snapshot.token);
      sessionStorage.setItem(ACCESS_EXP_KEY, String(snapshot.expiresAt));
    } else {
      sessionStorage.removeItem(ACCESS_KEY);
      sessionStorage.removeItem(ACCESS_EXP_KEY);
    }
  } catch {
    // sessionStorage disabled — token will be in-memory only.
  }
}

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
    writeSnapshot(null);
    return;
  }
  const exp = decodeJwtExp(token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    exp ?? (typeof expiresInSeconds === "number" ? now + expiresInSeconds : now + 900);
  accessSnapshot = { token, expiresAt };
  writeSnapshot(accessSnapshot);
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

function attachAuth(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
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
        (isSafe || original._allowReplay !== false)
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
