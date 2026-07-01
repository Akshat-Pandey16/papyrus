import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStudioChrome } from "@/features/studio/chrome-store";
import { ResultsDrawer } from "@/features/studio/results-drawer";
import { useStudioStore } from "@/features/studio/store";
import { ToolLauncher } from "@/features/studio/tool-launcher";
import { TOOL_PATH } from "@/features/studio/tools";

export function StudioChrome() {
  const navigate = useNavigate();
  const activeTool = useStudioStore((s) => s.activeTool);
  const launcherOpen = useStudioChrome((s) => s.launcherOpen);
  const resultsOpen = useStudioChrome((s) => s.resultsOpen);
  const setLauncherOpen = useStudioChrome((s) => s.setLauncherOpen);
  const toggleLauncher = useStudioChrome((s) => s.toggleLauncher);
  const setResultsOpen = useStudioChrome((s) => s.setResultsOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleLauncher();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleLauncher]);

  return (
    <>
      <ToolLauncher
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        activeTool={activeTool}
        onSelect={(id) => void navigate({ to: TOOL_PATH[id] })}
      />
      <ResultsDrawer open={resultsOpen} onOpenChange={setResultsOpen} />
    </>
  );
}
