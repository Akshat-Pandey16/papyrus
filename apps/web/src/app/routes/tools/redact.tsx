import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/redact")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: RedactRoute,
});

function RedactRoute() {
  return <Studio initialTool="redact" />;
}
