import type { Organization as ApiOrg, User as ApiUser } from "@papyrus/shared-types";
import { type ReactNode, useEffect } from "react";
import { fetchSession, refreshAccessOnly } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { apiClient, isAccessTokenValid, registerRefreshHandler } from "@/lib/api/client";

type ApiMe = { user: ApiUser; organization: ApiOrg };

let bootstrapPromise: Promise<void> | null = null;

async function loadCurrentUser(): Promise<boolean> {
  const { setUser, clear } = useAuthStore.getState();
  try {
    const { data } = await apiClient.get<ApiMe>("/auth/me");
    setUser(
      {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.full_name,
        isActive: data.user.is_active,
        isAnonymous: data.user.is_anonymous,
        emailVerifiedAt: data.user.email_verified_at,
        createdAt: data.user.created_at,
      },
      data.organization,
    );
    return true;
  } catch {
    clear();
    return false;
  }
}

function bootstrapOnce(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const { setSession, clear } = useAuthStore.getState();

    if (isAccessTokenValid()) {
      const ok = await loadCurrentUser();
      if (ok) return;
    }

    const session = await fetchSession();
    if (session) setSession(session);
    else clear();
  })();
  return bootstrapPromise;
}

registerRefreshHandler(async () => {
  const access = await refreshAccessOnly();
  if (!access) {
    useAuthStore.getState().clear();
    return null;
  }
  useAuthStore.getState().setAccess(access);
  return access.accessToken;
});

export function SessionBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    void bootstrapOnce();
  }, []);

  return <>{children}</>;
}
