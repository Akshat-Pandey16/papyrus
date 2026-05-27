import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/compress")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: CompressRoute,
});

function CompressRoute() {
  return <Studio initialTool="compress" />;
}
