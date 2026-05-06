import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type {
  AuthOrganization,
  AuthSession,
  AuthUser,
  TokenPair,
} from "@/features/auth/types";
import { useAuthStore } from "@/features/auth/store";
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from "@/features/auth/schemas";

type ApiUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

type ApiOrg = { id: string; name: string; slug: string };

type ApiTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

type ApiSession = { user: ApiUser; organization: ApiOrg; tokens: ApiTokens };

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

function mapOrg(o: ApiOrg): AuthOrganization {
  return { id: o.id, name: o.name, slug: o.slug };
}

function mapTokens(t: ApiTokens): TokenPair {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    tokenType: t.token_type,
    expiresIn: t.expires_in,
  };
}

function mapSession(s: ApiSession): AuthSession {
  return {
    user: mapUser(s.user),
    organization: mapOrg(s.organization),
    tokens: mapTokens(s.tokens),
  };
}

export const authKeys = {
  me: ["auth", "me"] as const,
};

export function useSignupMutation() {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignupInput): Promise<AuthSession> => {
      const { data } = await apiClient.post<ApiSession>("/auth/signup", {
        email: input.email,
        password: input.password,
        confirm_password: input.confirmPassword,
        full_name: input.fullName ?? null,
      });
      return mapSession(data);
    },
    onSuccess: (session) => {
      setSession(session);
      qc.setQueryData(authKeys.me, session);
    },
  });
}

export function useLoginMutation() {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput): Promise<AuthSession> => {
      const { data } = await apiClient.post<ApiSession>("/auth/login", {
        email: input.email,
        password: input.password,
      });
      return mapSession(data);
    },
    onSuccess: (session) => {
      setSession(session);
      qc.setQueryData(authKeys.me, session);
    },
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: async (
      input: ForgotPasswordInput,
    ): Promise<{ detail: string; debugToken: string | null }> => {
      const { data } = await apiClient.post<{
        detail: string;
        debug_token: string | null;
      }>("/auth/forgot-password", { email: input.email });
      return { detail: data.detail, debugToken: data.debug_token };
    },
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: async (input: ResetPasswordInput): Promise<{ detail: string }> => {
      const { data } = await apiClient.post<{ detail: string }>("/auth/reset-password", {
        token: input.token,
        password: input.password,
        confirm_password: input.confirmPassword,
      });
      return data;
    },
  });
}

export function useLogoutMutation() {
  const clear = useAuthStore((s) => s.clear);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post("/auth/logout");
      } catch {
        // server-side stateless — ignore
      }
    },
    onSettled: () => {
      clear();
      qc.removeQueries({ queryKey: authKeys.me });
    },
  });
}

export function useMeQuery(enabled: boolean) {
  const setUser = useAuthStore((s) => s.setUser);
  return useQuery({
    queryKey: authKeys.me,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AuthSession> => {
      const { data } = await apiClient.get<ApiSession>("/auth/me");
      const session = mapSession(data);
      setUser(session.user, session.organization);
      return session;
    },
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const { data } = await apiClient.post<ApiTokens>("/auth/refresh", {
    refresh_token: refreshToken,
  });
  return mapTokens(data);
}
