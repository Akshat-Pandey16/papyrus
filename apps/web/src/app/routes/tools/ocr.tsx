import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/ocr")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: OcrRoute,
});

function OcrRoute() {
  return <Studio initialTool="ocr" />;
}
