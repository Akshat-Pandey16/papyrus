import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/merge")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: MergeRoute,
});

function MergeRoute() {
  return <Studio initialTool="merge" />;
}
