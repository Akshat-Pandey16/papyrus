import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/sign")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: SignRoute,
});

function SignRoute() {
  return <Studio initialTool="sign" />;
}
