import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/extract-text")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: ExtractTextRoute,
});

function ExtractTextRoute() {
  return <Studio initialTool="extract_text" />;
}
