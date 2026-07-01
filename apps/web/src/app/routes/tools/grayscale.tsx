import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/grayscale")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: GrayscaleRoute,
});

function GrayscaleRoute() {
  return <Studio initialTool="grayscale" />;
}
