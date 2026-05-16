import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangePasswordInput, ProfileInput } from "@/features/account/schemas";
import type { AccountSession } from "@/features/account/types";
import { useAuthStore } from "@/features/auth/store";
import type { AuthUser } from "@/features/auth/types";
import { apiClient } from "@/lib/api/client";

type ApiUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

type ApiSession = {
  id: string;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
  current: boolean;
};

function mapUser(u: ApiUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    isActive: u.is_active,
    emailVerifiedAt: u.email_verified_at,
    createdAt: u.created_at,
  };
}

function mapSession(s: ApiSession): AccountSession {
  return {
    id: s.id,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    userAgent: s.user_agent,
    ipAddress: s.ip_address,
    current: s.current,
  };
}

export const accountKeys = {
  all: ["account"] as const,
  sessions: () => [...accountKeys.all, "sessions"] as const,
};

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: async (input: ChangePasswordInput) => {
      const { data } = await apiClient.post<{ detail: string }>("/auth/change-password", {
        current_password: input.currentPassword,
        password: input.password,
        confirm_password: input.confirmPassword,
      });
      return data;
    },
  });
}

export function useUpdateProfileMutation() {
  const setUser = useAuthStore((s) => s.setUser);
  const organization = useAuthStore((s) => s.organization);
  return useMutation({
    mutationFn: async (input: ProfileInput) => {
      const trimmed = input.fullName.trim();
      const { data } = await apiClient.patch<ApiUser>("/users/me", {
        full_name: trimmed.length > 0 ? trimmed : null,
      });
      return mapUser(data);
    },
    onSuccess: (user) => {
      if (organization) setUser(user, organization);
    },
  });
}

export function useSessionsQuery() {
  return useQuery({
    queryKey: accountKeys.sessions(),
    staleTime: 30_000,
    queryFn: async (): Promise<AccountSession[]> => {
      const { data } = await apiClient.get<{ items: ApiSession[] }>("/auth/sessions");
      return data.items.map(mapSession);
    },
  });
}

export function useRevokeSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await apiClient.delete(`/auth/sessions/${sessionId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions() }),
  });
}

export function useRevokeOtherSessionsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.post("/auth/sessions/revoke-others");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions() }),
  });
}

export function useRequestEmailVerificationMutation() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{
        detail: string;
        debug_token: string | null;
      }>("/auth/verify-email/request");
      return { detail: data.detail, debugToken: data.debug_token };
    },
  });
}

export function useConfirmEmailVerificationMutation() {
  return useMutation({
    mutationFn: async (token: string) => {
      await apiClient.post("/auth/verify-email/confirm", { token });
    },
  });
}
