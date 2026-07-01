import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/metadata")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: MetadataRoute,
});

function MetadataRoute() {
  return <Studio initialTool="metadata" />;
}
