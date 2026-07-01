import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { springSoft } from "@/lib/motion";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-x-0 top-0 h-[65vh]"
          style={{
            background:
              "radial-gradient(120% 75% at 50% -10%, color-mix(in oklch, var(--color-primary) 12%, transparent), transparent 62%)",
          }}
        />
        <div className="absolute inset-0 bg-grain opacity-[0.03]" />
      </div>

      <header className="relative z-10 flex shrink-0 items-center justify-between p-5 sm:p-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogoMark className="size-8" />
          <span className="font-display text-base font-semibold tracking-tight text-foreground">
            Papyrus
          </span>
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSoft}
          className="w-full max-w-[440px] rounded-2xl border border-border/70 bg-card p-7 text-card-foreground shadow-clay sm:p-9"
        >
          <div className="mb-7 flex flex-col gap-2">
            <h1 className="font-display text-[2rem] font-semibold tracking-tight">{title}</h1>
            <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          <div className="mt-7 text-sm text-muted-foreground">{footer}</div>
        </motion.div>
      </main>

      <div className="relative z-10 flex shrink-0 justify-center px-4 pt-2 pb-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3.5 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary/80" />
          Zero-retention · Files purged in 24h · Self-hostable
        </span>
      </div>
    </div>
  );
}
