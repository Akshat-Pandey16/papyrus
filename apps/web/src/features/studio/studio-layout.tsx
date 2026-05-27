import type { ReactNode } from "react";

export function StudioLayout({ canvas, inspector }: { canvas: ReactNode; inspector: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0">{canvas}</div>
      <aside className="lg:sticky lg:top-[84px] lg:self-start">
        <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-clay lg:max-h-[calc(100svh-108px)]">
          {inspector}
        </div>
      </aside>
    </div>
  );
}
