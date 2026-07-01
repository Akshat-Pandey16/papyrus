import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/pdf-to-powerpoint")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: PdfToPowerpointRoute,
});

function PdfToPowerpointRoute() {
  return <Studio initialTool="pdf_to_powerpoint" />;
}
