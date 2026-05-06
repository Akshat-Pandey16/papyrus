import { apiClient } from "@/lib/api/client";

export type HealthResponse = {
  status: string;
  version: string;
};

export const endpoints = {
  health: {
    get: async (): Promise<HealthResponse> => {
      const { data } = await apiClient.get<HealthResponse>("/healthz");
      return data;
    },
  },
} as const;
