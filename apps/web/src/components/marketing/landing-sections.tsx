import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Code2, EyeOff, Server, ShieldCheck, Star, Timer } from "lucide-react";
import { motion } from "motion/react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { TOOL_ORDER, TOOL_PATH, TOOLS } from "@/features/studio/tools";
import { springSoft } from "@/lib/motion";

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={springSoft}
    >
      {children}
    </motion.div>
  );
}

const PRIVACY = [
  {
    icon: Timer,
    title: "Gone in 24 hours",
    body: "Every file is purged on a hard TTL. Flip on zero-retention and it's erased the instant you download.",
  },
  {
    icon: EyeOff,
    title: "No content logging",
    body: "We never log the bytes of your documents. Sensitive keys are redacted before anything is written.",
  },
  {
    icon: Server,
    title: "Bytes skip our servers",
    body: "Uploads go straight to object storage over presigned URLs — your file never touches the API container.",
  },
];

export function LandingSections() {
  return (
    <div className="relative w-full">
      <section className="w-full border-t border-border/60 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto w-full max-w-[1760px]">
          <Reveal className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Every tool, one drop</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Do anything to your PDF.
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
              No tab-juggling, no re-uploading. Your file stays put while you switch between every
              tool.
            </p>
          </Reveal>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {TOOL_ORDER.map((id) => {
              const tool = TOOLS[id];
              const Icon = tool.icon;
              return (
                <Link
                  key={id}
                  to={TOOL_PATH[id]}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-display text-base font-semibold">{tool.label}</span>
                  <span className="text-xs text-muted-foreground">{tool.tagline}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="w-full border-t border-border/60 bg-card/40 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto w-full max-w-[1760px]">
          <Reveal className="flex max-w-2xl flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck className="size-4" />
              Private by default
            </span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Your files are nobody's business. Not even ours.
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PRIVACY.map((f) => (
              <div
                key={f.title}
                className="flex h-full flex-col gap-3 rounded-2xl border border-border/70 bg-background p-6"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </span>
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full border-t border-border/60 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto w-full max-w-[1760px]">
          <div className="flex flex-col gap-6 rounded-2xl border border-border/70 bg-card p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                <Code2 className="size-4" />
                Open source
              </span>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Run the whole thing on your own metal.
              </h2>
              <p className="mt-3 text-[0.95rem] text-muted-foreground">
                Postgres, Redis, object storage, workers — it all ships in the box. Self-host in
                minutes. No vendor lock-in, no telemetry, free forever.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
              <Button asChild size="lg">
                <a
                  href="https://github.com/Akshat-Pandey16/papyrus"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Star />
                  Star on GitHub
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/signup">
                  Create a free account
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="w-full border-t border-border/60 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-start justify-between gap-5 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="font-display font-semibold text-foreground">Papyrus</span>
            <span className="ml-1">© {new Date().getFullYear()} · Free &amp; open source</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to={TOOL_PATH.compress} className="hover:text-foreground">
              Tools
            </Link>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <a
              href="https://github.com/Akshat-Pandey16/papyrus"
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
