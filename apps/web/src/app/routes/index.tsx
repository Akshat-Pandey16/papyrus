import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Papyrus</h1>
      <p className="text-muted-foreground text-lg">
        A free, open-source PDF processing toolkit. Merge, split, compress, OCR, and more — fast,
        private, async.
      </p>
      <div className="flex gap-3">
        <Button>Get started</Button>
        <Button variant="outline">View tools</Button>
      </div>
    </section>
  );
}
