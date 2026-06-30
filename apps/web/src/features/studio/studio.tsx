import { ScrollText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import { useUploadStore } from "@/features/pdf-compress/store";
import { useMergeStore } from "@/features/pdf-merge/store";
import { PasswordGate } from "@/features/studio/password-gate";
import { ResultsDrawer } from "@/features/studio/results-drawer";
import { isActivePhase, useSessionJobs } from "@/features/studio/session-jobs";
import { useStudioStore } from "@/features/studio/store";
import { StudioHero } from "@/features/studio/studio-hero";
import { ToolDock } from "@/features/studio/tool-dock";
import { ToolLauncher } from "@/features/studio/tool-launcher";
import { TOOLS } from "@/features/studio/tools";
import { CompressTool } from "@/features/studio/tools/compress-tool";
import { CropTool } from "@/features/studio/tools/crop-tool";
import { EditTool } from "@/features/studio/tools/edit-tool";
import { ImagesToPdfTool } from "@/features/studio/tools/images-to-pdf-tool";
import { MergeTool } from "@/features/studio/tools/merge-tool";
import { OcrTool } from "@/features/studio/tools/ocr-tool";
import { PageNumbersTool } from "@/features/studio/tools/page-numbers-tool";
import { PdfToImagesTool } from "@/features/studio/tools/pdf-to-images-tool";
import { ProtectTool } from "@/features/studio/tools/protect-tool";
import { RedactTool } from "@/features/studio/tools/redact-tool";
import { ReorderTool } from "@/features/studio/tools/reorder-tool";
import { RotateTool } from "@/features/studio/tools/rotate-tool";
import { SignTool } from "@/features/studio/tools/sign-tool";
import { SplitTool } from "@/features/studio/tools/split-tool";
import { UnlockTool } from "@/features/studio/tools/unlock-tool";
import { WatermarkTool } from "@/features/studio/tools/watermark-tool";
import type { SingleToolProps, StudioFile, ToolId } from "@/features/studio/types";
import { validateFor } from "@/features/studio/validate";
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
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLauncherOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  const accept = TOOLS[activeTool].accept;
  const firstFile = files[0]?.file ?? null;
  const showEmpty = multi ? files.length === 0 : firstFile == null;

  const acceptFiles = (incoming: File[]) => {
    const valid: StudioFile[] = [];
    for (const f of incoming) {
      const err = validateFor(accept, f);
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
    if (activeTool === "images_to_pdf")
      return <ImagesToPdfTool onLaunched={() => setResultsOpen(true)} />;
    if (!firstFile) return null;
    if (activeTool === "unlock") return <UnlockTool {...singleProps} />;
    const inner = (() => {
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
        case "protect":
          return <ProtectTool {...singleProps} />;
        case "watermark":
          return <WatermarkTool {...singleProps} />;
        case "page_numbers":
          return <PageNumbersTool {...singleProps} />;
        case "crop":
          return <CropTool {...singleProps} />;
        case "pdf_to_images":
          return <PdfToImagesTool {...singleProps} />;
        case "sign":
          return <SignTool {...singleProps} />;
        case "redact":
          return <RedactTool {...singleProps} />;
        case "edit":
          return <EditTool {...singleProps} />;
        default:
          return null;
      }
    })();
    if (!inner) return null;
    return (
      <PasswordGate key={firstFile.name + firstFile.size} file={firstFile}>
        {inner}
      </PasswordGate>
    );
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
      <AnimatePresence mode="wait" initial={false}>
        {showEmpty ? (
          <motion.div
            key="empty"
            variants={fadeRise}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex min-h-[calc(100svh-4rem)] w-full items-center pb-24"
          >
            <StudioHero
              tool={TOOLS[activeTool]}
              generic={initialTool == null}
              multi={multi}
              accept={accept}
              onFiles={acceptFiles}
            />
          </motion.div>
        ) : (
          <motion.div
            key={activeTool}
            variants={fadeRise}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mx-auto w-full max-w-[1600px] px-4 pt-6 pb-32 sm:px-6 lg:px-8 lg:pt-8"
          >
            {renderTool()}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dragOver ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-oxblood/50"
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
        onOpenLauncher={() => setLauncherOpen(true)}
        resultsCount={sessionJobs.length}
        activeCount={activeCount}
        onOpenResults={() => setResultsOpen(true)}
      />
      <ToolLauncher
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        activeTool={activeTool}
        onSelect={setActiveTool}
      />
      <ResultsDrawer open={resultsOpen} onOpenChange={setResultsOpen} />
    </div>
  );
}
