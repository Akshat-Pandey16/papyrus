import { createFileRoute } from "@tanstack/react-router";
import { LandingSections } from "@/components/marketing/landing-sections";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { useAuthStore } from "@/features/auth/store";
import { Studio } from "@/features/studio/studio";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    void ensureAnonymousSession();
  },
  component: HomePage,
});

function HomePage() {
  const showMarketing = useAuthStore((s) => !s.user || s.user.isAnonymous);
  return (
    <>
      <Studio />
      {showMarketing ? <LandingSections /> : null}
    </>
  );
}
