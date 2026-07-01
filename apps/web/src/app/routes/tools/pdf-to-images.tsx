import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/pdf-to-images")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: PdfToImagesRoute,
});

function PdfToImagesRoute() {
  return <Studio initialTool="pdf_to_images" />;
}
