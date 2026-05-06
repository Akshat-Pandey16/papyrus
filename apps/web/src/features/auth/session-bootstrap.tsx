import { type ReactNode, useEffect, useState } from "react";
import { fetchSession, refreshAccessOnly } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { apiClient, isAccessTokenValid, registerRefreshHandler } from "@/lib/api/client";

type ApiUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};
type ApiOrg = { id: string; name: string; slug: string };
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    bootstrapOnce().finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-svh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
