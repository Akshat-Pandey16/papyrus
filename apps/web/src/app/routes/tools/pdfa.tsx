import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/pdfa")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: PdfaRoute,
});

function PdfaRoute() {
  return <Studio initialTool="pdfa" />;
}
