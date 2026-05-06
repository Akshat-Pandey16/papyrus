import { useEffect, useRef, useState, type ReactNode } from "react";
import { refreshAccessToken } from "@/features/auth/api";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
  useAuthStore,
} from "@/features/auth/store";
import { apiClient } from "@/lib/api/client";

type ApiUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

type ApiOrg = { id: string; name: string; slug: string };

export function SessionBootstrap({ children }: { children: ReactNode }) {
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const [ready, setReady] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const refresh = getStoredRefreshToken();
    if (!refresh) {
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const tokens = await refreshAccessToken(refresh);
        if (cancelled) return;
        setTokens(tokens);
        const { data } = await apiClient.get<{ user: ApiUser; organization: ApiOrg }>("/auth/me");
        if (cancelled) return;
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
      } catch {
        clearStoredRefreshToken();
        clear();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setTokens, setUser, clear]);

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
