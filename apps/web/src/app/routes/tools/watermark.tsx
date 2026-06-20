import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/watermark")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: WatermarkRoute,
});

function WatermarkRoute() {
  return <Studio initialTool="watermark" />;
}
