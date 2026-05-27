import { Minus, Plus } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type NumberInputProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean | undefined;
  ariaLabel?: string;
  className?: string;
  id?: string;
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function NumberInput({
  value,
  onChange,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  disabled = false,
  ariaLabel,
  className,
  id,
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      lastCommittedRef.current = value;
      setDraft(String(value));
    }
  }, [value]);

  const commit = useCallback(
    (raw: string) => {
      const parsed = Number.parseInt(raw, 10);
      const next = clamp(Number.isNaN(parsed) ? min : parsed, min, max);
      lastCommittedRef.current = next;
      setDraft(String(next));
      if (next !== value) onChange(next);
    },
    [min, max, onChange, value],
  );

  const stepBy = useCallback(
    (delta: number) => {
      const next = clamp(value + delta, min, max);
      lastCommittedRef.current = next;
      setDraft(String(next));
      if (next !== value) onChange(next);
    },
    [value, min, max, onChange],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      stepBy(step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(-step);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(e.currentTarget.value);
      e.currentTarget.blur();
    }
  };

  return (
    <div
      className={cn(
        "inline-flex h-11 items-center rounded-xl border border-input bg-card shadow-clay-sm",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrement"
        onClick={() => stepBy(-step)}
        disabled={disabled || value <= min}
        className="grid h-full w-10 place-items-center rounded-l-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-full w-14 bg-transparent text-center font-mono text-sm font-medium tabular-nums text-foreground focus:outline-none"
      />
      <button
        type="button"
        aria-label="Increment"
        onClick={() => stepBy(step)}
        disabled={disabled || value >= max}
        className="grid h-full w-10 place-items-center rounded-r-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
