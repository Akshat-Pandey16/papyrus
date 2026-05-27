import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/reorder")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: ReorderRoute,
});

function ReorderRoute() {
  return <Studio initialTool="reorder" />;
}
