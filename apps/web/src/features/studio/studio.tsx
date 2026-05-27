import { ScrollText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useMergeStore } from "@/features/pdf-merge/store";
import { Dropzone } from "@/features/studio/dropzone";
import { ResultsDrawer } from "@/features/studio/results-drawer";
import { ResultsHost } from "@/features/studio/results-host";
import { isActivePhase, useSessionJobs } from "@/features/studio/session-jobs";
import { useStudioStore } from "@/features/studio/store";
import { ToolDock } from "@/features/studio/tool-dock";
import { TOOLS } from "@/features/studio/tools";
import { CompressTool } from "@/features/studio/tools/compress-tool";
import { MergeTool } from "@/features/studio/tools/merge-tool";
import { OcrTool } from "@/features/studio/tools/ocr-tool";
import { ReorderTool } from "@/features/studio/tools/reorder-tool";
import { RotateTool } from "@/features/studio/tools/rotate-tool";
import { SplitTool } from "@/features/studio/tools/split-tool";
import type { SingleToolProps, StudioFile, ToolId } from "@/features/studio/types";
import { validatePdf } from "@/features/studio/validate";
import { fadeRise } from "@/lib/motion";
import { randomUUID } from "@/lib/uuid";

export function Studio({ initialTool }: { initialTool?: ToolId }) {
  const activeTool = useStudioStore((s) => s.activeTool);
  const setActiveTool = useStudioStore((s) => s.setActiveTool);
  const files = useStudioStore((s) => s.files);
  const setFiles = useStudioStore((s) => s.setFiles);
  const addFiles = useStudioStore((s) => s.addFiles);
  const clearFiles = useStudioStore((s) => s.clearFiles);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const sessionJobs = useSessionJobs();
  const activeCount = sessionJobs.filter((j) => isActivePhase(j.phase)).length;

  useEffect(() => {
    void ensureAnonymousSession();
    useUploadStore.getState().clearStale();
    useMergeStore.getState().clearStale();
  }, []);

  useEffect(() => {
    if (initialTool) setActiveTool(initialTool);
  }, [initialTool, setActiveTool]);

  const multi = TOOLS[activeTool].multi;
  const firstFile = files[0]?.file ?? null;
  const showEmpty = multi ? files.length === 0 : firstFile == null;

  const acceptFiles = (incoming: File[]) => {
    const valid: StudioFile[] = [];
    for (const f of incoming) {
      const err = validatePdf(f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        continue;
      }
      valid.push({ id: randomUUID(), file: f });
    }
    if (valid.length === 0) return;
    if (multi) addFiles(valid);
    else {
      const first = valid[0];
      if (first) setFiles([first]);
    }
  };

  const hasFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types ?? []).includes("Files");

  const onDragEnter = (e: DragEvent) => {
    if (showEmpty || !hasFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (showEmpty || !hasFileDrag(e)) return;
    e.preventDefault();
  };
  const onDragLeave = () => {
    if (showEmpty) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDrop = (e: DragEvent) => {
    if (showEmpty) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    acceptFiles(Array.from(e.dataTransfer.files));
  };

  const singleProps: SingleToolProps = {
    file: firstFile as File,
    onReplaceFile: (f) => setFiles([{ id: randomUUID(), file: f }]),
    onRemove: () => clearFiles(),
    onLaunched: () => setResultsOpen(true),
  };

  const renderTool = () => {
    if (activeTool === "merge") return <MergeTool onLaunched={() => setResultsOpen(true)} />;
    if (!firstFile) return null;
    switch (activeTool) {
      case "compress":
        return <CompressTool {...singleProps} />;
      case "split":
        return <SplitTool {...singleProps} />;
      case "rotate":
        return <RotateTool {...singleProps} />;
      case "reorder":
        return <ReorderTool {...singleProps} />;
      case "ocr":
        return <OcrTool {...singleProps} />;
      default:
        return null;
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop-surface container; the interactive controls live inside
    <div
      className="relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 pb-32 sm:px-6 lg:px-8 lg:pt-8">
        <AnimatePresence mode="wait" initial={false}>
          {showEmpty ? (
            <motion.div key="empty" variants={fadeRise} initial="hidden" animate="show" exit="exit">
              <Dropzone onFiles={acceptFiles} multi={multi} />
            </motion.div>
          ) : (
            <motion.div
              key={activeTool}
              variants={fadeRise}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {renderTool()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {dragOver ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-oxblood/40 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-card/90 px-10 py-8 shadow-clay-lg">
              <ScrollText className="size-10 text-primary" />
              <p className="font-display text-xl font-semibold">
                Drop to {multi ? "add" : "replace"}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ToolDock
        activeTool={activeTool}
        onSelect={setActiveTool}
        resultsCount={sessionJobs.length}
        activeCount={activeCount}
        onOpenResults={() => setResultsOpen(true)}
      />
      <ResultsHost />
      <ResultsDrawer open={resultsOpen} onOpenChange={setResultsOpen} />
    </div>
  );
}
