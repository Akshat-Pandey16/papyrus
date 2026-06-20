import { createFileRoute } from "@tanstack/react-router";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/tools/page-numbers")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: PageNumbersRoute,
});

function PageNumbersRoute() {
  return <Studio initialTool="page_numbers" />;
}
