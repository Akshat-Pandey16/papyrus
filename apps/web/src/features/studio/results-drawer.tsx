import { Inbox, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { Drawer } from "vaul";
import { ResultCard } from "@/features/studio/result-card";
import { useSessionJobs } from "@/features/studio/session-jobs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export function ResultsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const jobs = useSessionJobs();
  const direction = isDesktop ? "right" : "bottom";

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={direction}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-oxblood/45 backdrop-blur-sm" />
        <Drawer.Content
          className={cn(
            "fixed z-50 flex flex-col bg-popover text-popover-foreground outline-none",
            isDesktop
              ? "inset-y-0 right-0 w-[420px] max-w-[92vw] rounded-l-3xl border-l border-border/70"
              : "inset-x-0 bottom-0 max-h-[88svh] rounded-t-3xl border-t border-border/70",
          )}
        >
          {!isDesktop ? (
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
          ) : null}
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <Drawer.Title className="flex items-center gap-2 font-display text-lg font-semibold">
              <Inbox className="size-5 text-primary" />
              Results
            </Drawer.Title>
            <Drawer.Close
              aria-label="Close"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <X className="size-4" />
            </Drawer.Close>
          </div>
          <Drawer.Description className="sr-only">
            Jobs and downloads from this session
          </Drawer.Description>

          <div className="flex-1 overflow-y-auto px-5 pb-8">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <Inbox className="size-6" />
                </span>
                <p className="text-sm font-medium">Nothing here yet</p>
                <p className="max-w-[240px] text-xs text-muted-foreground">
                  Run a tool and your files will land here — they download automatically when ready.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {jobs.map((j) => (
                    <li key={j.key}>
                      <ResultCard job={j} />
                    </li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
