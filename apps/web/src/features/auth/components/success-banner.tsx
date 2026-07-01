import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

export function SuccessBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/12 px-3.5 py-3 text-sm text-success">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
