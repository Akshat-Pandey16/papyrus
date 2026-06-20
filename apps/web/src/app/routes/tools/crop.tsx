import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/crop")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: CropRoute,
});

function CropRoute() {
  return <Studio initialTool="crop" />;
}
