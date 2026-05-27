import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Code2,
  EyeOff,
  FileSignature,
  Lock,
  Server,
  ShieldCheck,
  Star,
  Timer,
} from "lucide-react";
import { motion } from "motion/react";
import { LogoMark } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TOOL_ORDER, TOOL_PATH, TOOLS } from "@/features/studio/tools";
import { springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ ...springSoft, delay }}
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
      <section className="w-full px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto w-full max-w-[1400px]">
          <Reveal className="flex flex-col gap-3">
            <Badge tone="primary" className="self-start">
              Six tools, one canvas
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Drop once. <span className="text-molten">Do anything.</span>
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
              No tab-juggling, no re-uploading. Your file stays on the canvas while you switch
              between every tool.
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {TOOL_ORDER.map((id, i) => {
              const tool = TOOLS[id];
              const Icon = tool.icon;
              return (
                <Reveal key={id} delay={i * 0.04}>
                  <Link
                    to={TOOL_PATH[id]}
                    className="group flex h-full flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-clay-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-clay"
                  >
                    <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary transition-colors group-hover:bg-molten group-hover:text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <span className="font-display text-lg font-semibold">{tool.verb}</span>
                    <span className="text-xs text-muted-foreground">{tool.tagline}</span>
                  </Link>
                </Reveal>
              );
            })}
            {[
              { icon: FileSignature, label: "Sign" },
              { icon: Lock, label: "Redact" },
            ].map((t, i) => (
              <Reveal key={t.label} delay={(TOOL_ORDER.length + i) * 0.04}>
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-5">
                  <span className="grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <t.icon className="size-5" />
                  </span>
                  <span className="font-display text-lg font-semibold text-muted-foreground">
                    {t.label}
                  </span>
                  <Badge tone="muted" className="self-start">
                    Soon
                  </Badge>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative w-full overflow-hidden border-y border-border/60 bg-card/50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.04]" />
        <div className="relative mx-auto w-full max-w-[1400px]">
          <Reveal className="flex max-w-2xl flex-col gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck className="size-4" />
              Private by default
            </span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Your files are nobody's business. Not even ours.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PRIVACY.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-border/70 bg-background p-6">
                  <span className="grid size-11 place-items-center rounded-2xl bg-molten text-primary-foreground shadow-clay-sm">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto w-full max-w-[1400px]">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-molten p-8 text-primary-foreground shadow-ember sm:p-12">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 12% 0%, rgba(255,255,255,0.55) 0, transparent 38%), radial-gradient(circle at 100% 100%, rgba(255,255,255,0.3) 0, transparent 40%)",
                }}
              />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <Badge className="mb-4 border-0 bg-white/20 text-primary-foreground">
                    <Code2 />
                    Open source
                  </Badge>
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                    Run the whole thing on your own metal.
                  </h2>
                  <p className="mt-3 text-[0.95rem] text-primary-foreground/85">
                    Postgres, Redis, object storage, workers — it all ships in the box. Self-host in
                    minutes. No vendor lock-in, no telemetry, free forever.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <Button asChild size="lg" variant="secondary">
                    <a href="https://github.com" target="_blank" rel="noreferrer noopener">
                      <Star />
                      Star on GitHub
                    </a>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                  >
                    <Link to="/signup">
                      Create a free account
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="w-full border-t border-border/60 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col items-start justify-between gap-5 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="font-display font-semibold text-foreground">Papyrus</span>
            <span className={cn("ml-1")}>
              © {new Date().getFullYear()} · Free &amp; open source
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to={TOOL_PATH.compress} className="hover:text-foreground">
              Tools
            </Link>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <a
              href="https://github.com"
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
