import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { TOOL_ORDER, TOOL_PATH, TOOLS } from "@/features/studio/tools";

export function ToolGrid({ activeTool }: { activeTool?: string | undefined }) {
  return (
    <section className="w-full border-t border-border/60 px-6 py-14 sm:px-10 lg:px-16 lg:py-20 2xl:px-24">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[0.7rem] tracking-[0.2em] text-primary uppercase">
          The workshop
        </span>
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Every tool, <span className="text-primary italic">one drop.</span>
        </h2>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {TOOL_ORDER.map((id) => {
          const tool = TOOLS[id];
          const Icon = tool.icon;
          const active = id === activeTool;
          return (
            <Link
              key={id}
              to={TOOL_PATH[id]}
              aria-current={active ? "page" : undefined}
              className={`group flex flex-col gap-2.5 rounded-2xl border bg-card p-4 transition-colors ${
                active
                  ? "border-primary/50 ring-1 ring-primary/30"
                  : "border-border/70 hover:border-primary/40 hover:bg-accent/40"
              }`}
            >
              <span
                className="tool-tile grid size-10 place-items-center rounded-xl"
                style={{ "--tool-hue": tool.hue } as CSSProperties}
              >
                <Icon className="size-5" />
              </span>
              <span className="text-sm font-semibold text-foreground">{tool.label}</span>
              <span className="text-xs leading-snug text-muted-foreground">{tool.tagline}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
