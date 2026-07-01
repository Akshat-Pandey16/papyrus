import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/pdf-to-word")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: PdfToWordRoute,
});

function PdfToWordRoute() {
  return <Studio initialTool="pdf_to_word" />;
}
