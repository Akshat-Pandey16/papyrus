import type {
  AccessToken as ApiAccess,
  Organization as ApiOrg,
  AuthSession as ApiSession,
  User as ApiUser,
} from "@papyrus/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from "@/features/auth/schemas";
import { useAuthStore } from "@/features/auth/store";
import type { AccessToken, AuthOrganization, AuthSession, AuthUser } from "@/features/auth/types";
import { apiClient } from "@/lib/api/client";

function mapUser(u: ApiUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    isActive: u.is_active,
    isAnonymous: u.is_anonymous,
    emailVerifiedAt: u.email_verified_at,
    createdAt: u.created_at,
  };
}

function mapOrg(o: ApiOrg): AuthOrganization {
  return { id: o.id, name: o.name, slug: o.slug };
}

function mapAccess(a: ApiAccess): AccessToken {
  return {
    accessToken: a.access_token,
    tokenType: a.token_type,
    expiresIn: a.expires_in,
  };
}

function mapSession(s: ApiSession): AuthSession {
  return {
    user: mapUser(s.user),
    organization: mapOrg(s.organization),
    access: mapAccess(s.access),
  };
}

export const authKeys = {
  session: ["auth", "session"] as const,
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
      qc.setQueryData(authKeys.session, session);
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
      qc.setQueryData(authKeys.session, session);
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

export async function createAnonymousSession(): Promise<AuthSession | null> {
  try {
    const { data } = await apiClient.post<ApiSession>("/auth/anonymous", undefined, {
      _skipAuthRetry: true,
    } as never);
    return mapSession(data);
  } catch {
    return null;
  }
}

const PERSISTED_FEATURE_STORES = ["papyrus.uploads.v2", "papyrus.merge.v1"];

function purgeFeatureState() {
  try {
    for (const key of PERSISTED_FEATURE_STORES) {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

export function useLogoutMutation() {
  const clear = useAuthStore((s) => s.clear);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.post("/auth/logout", undefined, { _skipAuthRetry: true } as never);
    },
    onSettled: () => {
      clear();
      purgeFeatureState();
      qc.clear();
    },
  });
}

export function useSessionQuery(enabled: boolean) {
  const setSession = useAuthStore((s) => s.setSession);
  return useQuery({
    queryKey: authKeys.session,
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<AuthSession> => {
      const { data } = await apiClient.get<ApiSession>("/auth/session", {
        _skipAuthRetry: true,
      } as never);
      const session = mapSession(data);
      setSession(session);
      return session;
    },
  });
}

export async function fetchSession(): Promise<AuthSession | null> {
  try {
    const { data } = await apiClient.get<ApiSession>("/auth/session", {
      _skipAuthRetry: true,
    } as never);
    return mapSession(data);
  } catch {
    return null;
  }
}

export async function refreshAccessOnly(): Promise<AccessToken | null> {
  try {
    const { data } = await apiClient.post<ApiAccess>("/auth/refresh", undefined, {
      _skipAuthRetry: true,
    } as never);
    return mapAccess(data);
  } catch {
    return null;
  }
}
