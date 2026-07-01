import { cn } from "@/lib/utils";

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

type StrengthMeta = {
  score: number;
  strength: PasswordStrength;
};

const ORDER: readonly PasswordStrength[] = ["weak", "fair", "good", "strong"];

const LABEL: Record<PasswordStrength, string> = {
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

const HINT: Record<PasswordStrength, string> = {
  weak: "Add length and a mix of characters.",
  fair: "Getting there — mix in symbols or more length.",
  good: "Solid. A little more length makes it great.",
  strong: "Strong password.",
};

const FILL: Record<PasswordStrength, string> = {
  weak: "bg-destructive",
  fair: "bg-warning",
  good: "bg-primary",
  strong: "bg-success",
};

const TONE: Record<PasswordStrength, string> = {
  weak: "text-destructive",
  fair: "text-warning-foreground",
  good: "text-primary",
  strong: "text-success",
};

export function estimatePasswordStrength(password: string): StrengthMeta {
  if (password.length === 0) return { score: 0, strength: "weak" };

  const classes =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/\d/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);

  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  if (classes >= 4) score += 1;

  if (password.length < 6) score = Math.min(score, 1);

  const index = score <= 1 ? 0 : score <= 3 ? 1 : score <= 4 ? 2 : 3;
  const strength = ORDER[index] ?? "weak";
  return { score, strength };
}

export function PasswordStrengthMeter({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  if (password.length === 0) return null;

  const { strength } = estimatePasswordStrength(password);
  const filled = ORDER.indexOf(strength) + 1;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex gap-1" aria-hidden>
        {ORDER.map((step, i) => (
          <span
            key={step}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              i < filled ? FILL[strength] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className={cn("font-semibold", TONE[strength])}>{LABEL[strength]}</span>
        {" — "}
        {HINT[strength]}
      </p>
    </div>
  );
}
