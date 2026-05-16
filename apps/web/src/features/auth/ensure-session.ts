import { createAnonymousSession } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";

let inflight: Promise<void> | null = null;

export async function ensureAnonymousSession(): Promise<void> {
  if (useAuthStore.getState().hasAccess) return;
  if (inflight) return inflight;
  inflight = (async () => {
    const session = await createAnonymousSession();
    if (session) {
      useAuthStore.getState().setSession(session);
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
