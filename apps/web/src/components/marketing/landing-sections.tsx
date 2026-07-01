import { Link } from "@tanstack/react-router";
import { ArrowUpRight, EyeOff, Server, Star, Timer } from "lucide-react";
import { motion } from "motion/react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { TOOL_PATH } from "@/features/studio/tools";
import { springSoft } from "@/lib/motion";

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={springSoft}
    >
      {children}
    </motion.div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[0.7rem] tracking-[0.2em] text-primary uppercase">
      {children}
    </span>
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
      <section className="w-full border-t border-border/60 bg-card/40 px-6 py-16 sm:px-10 lg:px-16 lg:py-24 2xl:px-24">
        <Reveal className="flex max-w-3xl flex-col gap-3">
          <Kicker>Private by default</Kicker>
          <h2 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Your files are nobody's business.{" "}
            <span className="text-primary italic">Not even ours.</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIVACY.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background p-6"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full border-t border-border/60 px-6 py-16 sm:px-10 lg:px-16 lg:py-24 2xl:px-24">
        <div className="flex flex-col gap-6 rounded-3xl border border-border/70 bg-card p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <Kicker>Open source</Kicker>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Run the whole thing on your own metal.
            </h2>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-muted-foreground">
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
      </section>

      <footer className="w-full border-t border-border/60 px-6 py-10 sm:px-10 lg:px-16 2xl:px-24">
        <div className="flex w-full flex-col items-start justify-between gap-5 text-sm text-muted-foreground sm:flex-row sm:items-center">
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
