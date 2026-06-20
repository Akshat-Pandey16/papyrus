import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/unlock")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: UnlockRoute,
});

function UnlockRoute() {
  return <Studio initialTool="unlock" />;
}
