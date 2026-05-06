import { create } from "zustand";
import type { AccessToken, AuthOrganization, AuthSession, AuthUser } from "@/features/auth/types";
import { setAccessToken } from "@/lib/api/client";

type AuthState = {
  user: AuthUser | null;
  organization: AuthOrganization | null;
  hasAccess: boolean;
  setSession: (session: AuthSession) => void;
  setAccess: (access: AccessToken) => void;
  setUser: (user: AuthUser, organization: AuthOrganization) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organization: null,
  hasAccess: false,
  setSession: (session) => {
    setAccessToken(session.access.accessToken, session.access.expiresIn);
    set({
      user: session.user,
      organization: session.organization,
      hasAccess: true,
    });
  },
  setAccess: (access) => {
    setAccessToken(access.accessToken, access.expiresIn);
    set({ hasAccess: true });
  },
  setUser: (user, organization) => set({ user, organization, hasAccess: true }),
  clear: () => {
    setAccessToken(null);
    set({ user: null, organization: null, hasAccess: false });
  },
}));
