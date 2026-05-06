import { create } from "zustand";
import { setAccessToken } from "@/lib/api/client";
import type { AuthOrganization, AuthSession, AuthUser, TokenPair } from "@/features/auth/types";

const REFRESH_KEY = "papyrus.refresh_token";

type AuthState = {
  user: AuthUser | null;
  organization: AuthOrganization | null;
  accessToken: string | null;
  hydrated: boolean;
  setSession: (session: AuthSession) => void;
  setTokens: (tokens: TokenPair) => void;
  setUser: (user: AuthUser, organization: AuthOrganization) => void;
  clear: () => void;
  hydrate: () => string | null;
};

function readRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefresh(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // storage disabled — refresh won't persist; that's fine.
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organization: null,
  accessToken: null,
  hydrated: false,
  setSession: (session) => {
    setAccessToken(session.tokens.accessToken);
    if (session.tokens.refreshToken) writeRefresh(session.tokens.refreshToken);
    set({
      user: session.user,
      organization: session.organization,
      accessToken: session.tokens.accessToken,
      hydrated: true,
    });
  },
  setTokens: (tokens) => {
    setAccessToken(tokens.accessToken);
    if (tokens.refreshToken) writeRefresh(tokens.refreshToken);
    set({ accessToken: tokens.accessToken });
  },
  setUser: (user, organization) => set({ user, organization, hydrated: true }),
  clear: () => {
    setAccessToken(null);
    writeRefresh(null);
    set({ user: null, organization: null, accessToken: null, hydrated: true });
  },
  hydrate: () => {
    const refresh = readRefresh();
    set({ hydrated: refresh === null ? true : false });
    return refresh;
  },
}));

export function getStoredRefreshToken(): string | null {
  return readRefresh();
}

export function clearStoredRefreshToken() {
  writeRefresh(null);
}
