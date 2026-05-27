import { createFileRoute } from "@tanstack/react-router";
import { LandingSections } from "@/components/marketing/landing-sections";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: HomePage,
});

function HomePage() {
  return (
    <>
      <Studio />
      <LandingSections />
    </>
  );
}
