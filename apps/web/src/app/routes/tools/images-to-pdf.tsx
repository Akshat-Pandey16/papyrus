import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/images-to-pdf")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: ImagesToPdfRoute,
});

function ImagesToPdfRoute() {
  return <Studio initialTool="images_to_pdf" />;
}
