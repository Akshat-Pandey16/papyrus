import { type ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type InputProps = ComponentProps<"input">;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-[0.95rem]",
        "shadow-xs transition-[border-color,box-shadow] outline-none",
        "placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
});
