import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Papyrus"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={`molten-${gid}`}
          x1="64"
          y1="40"
          x2="448"
          y2="472"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-ember)" />
          <stop offset="1" stopColor="var(--color-primary)" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill={`url(#molten-${gid})`} />
      <g
        fill="none"
        stroke="oklch(0.98 0.012 16)"
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M176 120h128a48 48 0 0 1 48 48v176a48 48 0 0 1-48 48H160a48 48 0 0 1-48-48V120z" />
        <path d="M112 120a32 32 0 0 1 64 0v224" />
        <path d="M208 196h104M208 256h104M208 316h72" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-8 shrink-0" />
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        Papyrus
      </span>
    </span>
  );
}
