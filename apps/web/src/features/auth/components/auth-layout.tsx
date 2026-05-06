import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  footer: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ title, subtitle, footer, aside, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh w-full lg:grid-cols-[1.05fr_1fr]">
      <section className="relative flex min-h-svh flex-col bg-background">
        <header className="flex items-center justify-between px-6 pt-6 sm:px-10 lg:px-14">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-foreground text-background">
              <FileText className="h-4.5 w-4.5" strokeWidth={2.25} />
            </span>
            Papyrus
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to site
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-[460px]">
            <div className="mb-8 flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                {title}
              </h1>
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{subtitle}</p>
            </div>
            {children}
            <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>

        <footer className="px-6 pb-6 sm:px-10 lg:px-14">
          <p className="text-xs text-muted-foreground/80">
            By continuing you agree to our{" "}
            <a className="underline-offset-4 hover:underline" href="#">
              Terms
            </a>{" "}
            and{" "}
            <a className="underline-offset-4 hover:underline" href="#">
              Privacy Policy
            </a>
            .
          </p>
        </footer>
      </section>

      <aside className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,#1a1a1a_0%,#0a0a0a_55%,#000_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.18] mix-blend-screen"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.6) 0, transparent 35%), radial-gradient(circle at 80% 75%, rgba(255,255,255,0.45) 0, transparent 38%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.95), transparent 70%)",
          }}
        />
        <div className="relative z-10 flex h-full w-full flex-col justify-between p-12 text-white">
          {aside ?? <DefaultAside />}
        </div>
      </aside>
    </div>
  );
}

function DefaultAside() {
  return (
    <>
      <div className="flex items-center gap-2 text-sm text-white/70">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_2px] shadow-emerald-400/60" />
        All systems operational
      </div>
      <div className="space-y-6">
        <h2 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-white">
          Move PDFs through your work, not the other way around.
        </h2>
        <p className="max-w-md text-[0.95rem] leading-relaxed text-white/70">
          Merge, split, compress, OCR, redact, and sign — privately, in your browser, backed by an
          async pipeline that scales.
        </p>
        <ul className="grid grid-cols-2 gap-3 text-sm text-white/80">
          {["Merge & split", "OCR & convert", "Compress smartly", "Redact securely"].map((label) => (
            <li
              key={label}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-sm"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-white/50">© Papyrus. Self-hostable. Open source.</p>
    </>
  );
}
