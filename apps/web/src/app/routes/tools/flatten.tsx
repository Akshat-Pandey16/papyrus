import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/flatten")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: FlattenRoute,
});

function FlattenRoute() {
  return <Studio initialTool="flatten" />;
}
