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
    <div className="relative grid min-h-svh w-full place-items-center overflow-hidden bg-oxblood px-4 py-20">
      <div aria-hidden className="absolute inset-0">
        <motion.div
          className="absolute -top-1/3 -left-1/4 size-[62vmax] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(229,55,155,0.55), transparent 60%)" }}
          animate={{ x: [0, 50, 0], y: [0, 36, 0] }}
          transition={{ duration: 19, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-1/4 -bottom-1/3 size-[56vmax] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(225,70,106,0.55), transparent 60%)" }}
          animate={{ x: [0, -46, 0], y: [0, -30, 0] }}
          transition={{ duration: 23, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 left-1/2 size-[40vmax] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(240,178,60,0.28), transparent 60%)" }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 15, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-grain opacity-[0.07] mix-blend-overlay" />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5 sm:p-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <LogoMark className="size-8" />
          <span className="font-display text-base font-semibold tracking-tight">Papyrus</span>
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-sm text-white/85 backdrop-blur transition-colors hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springSoft}
        className="relative z-10 w-full max-w-[460px] rounded-3xl border border-border/60 bg-popover p-7 shadow-clay-lg sm:p-9"
      >
        <div className="mb-7 flex flex-col gap-2">
          <h1 className="font-display text-[2rem] font-semibold tracking-tight">{title}</h1>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        {children}
        <div className="mt-7 text-sm text-muted-foreground">{footer}</div>
      </motion.div>

      <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs text-white/75 backdrop-blur">
          <ShieldCheck className="size-3.5" />
          Zero-retention · Files purged in 24h · Self-hostable
        </span>
      </div>
    </div>
  );
}
