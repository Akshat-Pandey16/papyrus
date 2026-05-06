import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { FileText, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const greeting = user?.fullName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="w-full px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {organization?.name ?? "Workspace"}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back, {greeting}.
          </h1>
          <p className="max-w-2xl text-[0.95rem] text-muted-foreground">
            Drop in a PDF to start a job, or pick a tool to get going. Your processed files appear
            here as soon as the worker finishes.
          </p>
        </header>

        <section className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center sm:p-16">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-foreground/5 text-foreground">
            <Upload className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold">Drop a PDF to get started</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            We'll detect what you can do with it — merge, split, compress, OCR, and more.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/tools/compress">Compress a PDF</Link>
            </Button>
            <Button size="lg" variant="outline">
              Browse all tools
            </Button>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Quick actions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Merge PDFs", desc: "Combine multiple PDFs into one.", to: null },
              {
                title: "Compress",
                desc: "Reduce file size while preserving quality.",
                to: "/tools/compress" as const,
              },
              { title: "OCR", desc: "Make scanned PDFs searchable and selectable.", to: null },
              { title: "Split", desc: "Pull out pages or split into chunks.", to: null },
              { title: "Convert", desc: "PDF ↔ Word, Excel, PowerPoint, images.", to: null },
              { title: "Redact", desc: "Permanently remove sensitive content.", to: null },
            ].map((tool) => {
              const className =
                "group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-foreground/20 hover:shadow-md";
              const inner = (
                <>
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-foreground/5 text-foreground/80 transition-colors group-hover:bg-foreground/10">
                    {tool.title === "OCR" ? (
                      <Sparkles className="h-4.5 w-4.5" />
                    ) : (
                      <FileText className="h-4.5 w-4.5" />
                    )}
                  </span>
                  <span className="text-base font-semibold">{tool.title}</span>
                  <span className="text-sm text-muted-foreground">{tool.desc}</span>
                </>
              );
              if (tool.to) {
                return (
                  <Link key={tool.title} to={tool.to} className={className}>
                    {inner}
                  </Link>
                );
              }
              return (
                <button key={tool.title} type="button" className={className} disabled>
                  {inner}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
