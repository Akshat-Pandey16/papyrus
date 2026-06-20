import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/edit")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: EditRoute,
});

function EditRoute() {
  return <Studio initialTool="edit" />;
}
