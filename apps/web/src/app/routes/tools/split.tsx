import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/split")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: SplitRoute,
});

function SplitRoute() {
  return <Studio initialTool="split" />;
}
