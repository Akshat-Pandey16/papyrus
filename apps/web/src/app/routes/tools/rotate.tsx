import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/rotate")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: RotateRoute,
});

function RotateRoute() {
  return <Studio initialTool="rotate" />;
}
