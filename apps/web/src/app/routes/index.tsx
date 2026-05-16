import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  FileSignature,
  Layers,
  Lock,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Split,
  Wand2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const tools = [
  {
    icon: Wand2,
    title: "Compress",
    desc: "Smaller files, same fidelity.",
    to: "/tools/compress" as const,
  },
  {
    icon: Layers,
    title: "Merge",
    desc: "Combine PDFs into one tidy file.",
    to: "/tools/merge" as const,
  },
  {
    icon: Split,
    title: "Split",
    desc: "Pull pages or split into chunks.",
    to: "/tools/split" as const,
  },
  {
    icon: ScanLine,
    title: "OCR",
    desc: "Make scans searchable and selectable.",
    to: "/tools/ocr" as const,
  },
  { icon: FileSignature, title: "Sign", desc: "Add legally binding signatures.", to: null },
  { icon: Lock, title: "Redact", desc: "Permanently remove sensitive data.", to: null },
];

const features = [
  {
    icon: Zap,
    title: "Built for speed",
    body: "Async pipeline, parallel workers, presigned uploads — files never get bottlenecked.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Zero-retention mode, no logs of file content, S3-side encryption — your docs stay yours.",
  },
  {
    icon: Sparkles,
    title: "Open source",
    body: "Self-host the whole stack on your own infra in minutes. No vendor lock-in, ever.",
  },
];

function LandingPage() {
  return (
    <div className="w-full">
      <Hero />
      <ToolsSection />
      <FeaturesSection />
      <CTASection />
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate w-full overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[640px] bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(120,120,255,0.20),transparent_60%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,0,0,0.6), transparent 70%)",
        }}
      />
      <div className="w-full px-6 py-20 sm:px-10 sm:py-28 lg:px-14 lg:py-36">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Open-source · Self-hostable · Free forever
          </span>
          <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            The PDF toolkit that respects your time
            <span className="text-muted-foreground"> — and your privacy.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Merge, split, compress, OCR, redact, and sign — all from one fast workspace. No uploads
            to a third party, no waiting, no nonsense.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-7 text-[0.95rem]">
              <Link to="/tools/compress">
                Try it without signing up
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-6 text-[0.95rem]">
              <Link to="/signup">Create a free account</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card · No signup needed · 25 MB anon uploads · 500 MB with a free account
          </p>
        </div>
      </div>
    </section>
  );
}

function ToolsSection() {
  return (
    <section className="w-full border-t border-border bg-card/40 py-20 sm:py-28">
      <div className="w-full px-6 sm:px-10 lg:px-14">
        <div className="mx-auto max-w-screen-2xl">
          <div className="mb-12 flex flex-col gap-3 sm:items-center sm:text-center">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Every PDF tool you need
            </span>
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              One workspace. One pipeline. No tab-juggling.
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tools.map((tool) => {
              const className =
                "group relative flex flex-col items-start gap-3 rounded-xl border border-border bg-background p-5 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg";
              const inner = (
                <>
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-foreground/5 text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                    <tool.icon className="h-5 w-5" />
                  </span>
                  <span className="text-base font-semibold">{tool.title}</span>
                  <span className="text-xs text-muted-foreground">{tool.desc}</span>
                  {!tool.to ? (
                    <span className="absolute right-3 top-3 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Soon
                    </span>
                  ) : null}
                </>
              );
              return tool.to ? (
                <Link key={tool.title} to={tool.to} className={className}>
                  {inner}
                </Link>
              ) : (
                <div key={tool.title} className={cn(className, "cursor-not-allowed opacity-70")}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="w-full py-20 sm:py-28">
      <div className="w-full px-6 sm:px-10 lg:px-14">
        <div className="mx-auto grid max-w-screen-2xl gap-10 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-foreground/5 text-foreground">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="w-full px-6 pb-24 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-screen-2xl">
        <div className="relative overflow-hidden rounded-3xl bg-foreground p-10 text-background sm:p-16">
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 0%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 100% 100%, rgba(255,255,255,0.25) 0, transparent 35%)",
            }}
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to wrangle your PDFs the right way?
              </h2>
              <p className="mt-3 text-[0.95rem] text-background/70">
                Sign up in seconds. No credit card. Cancel any time — there's nothing to cancel,
                because everything is free.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="h-12 px-7">
                <Link to="/signup">
                  Create your account
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/20 bg-transparent px-6 text-background hover:bg-white/10 hover:text-background"
              >
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="w-full border-t border-border bg-background">
      <div className="w-full px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-start justify-between gap-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background">
              <FileSignature className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-foreground">Papyrus</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <a href="#" className="hover:text-foreground">
              Privacy
            </a>
            <a href="#" className="hover:text-foreground">
              Terms
            </a>
            <a href="#" className="hover:text-foreground">
              Status
            </a>
            <a href="#" className="hover:text-foreground">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
