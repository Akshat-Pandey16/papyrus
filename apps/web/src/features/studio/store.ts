import { create } from "zustand";
import type { StudioFile, ToolId } from "@/features/studio/types";

type StudioState = {
  activeTool: ToolId;
  files: StudioFile[];
  setActiveTool: (tool: ToolId) => void;
  setFiles: (files: StudioFile[]) => void;
  addFiles: (files: StudioFile[]) => void;
  removeFile: (id: string) => void;
  reorderFiles: (from: number, to: number) => void;
  clearFiles: () => void;
};

export const useStudioStore = create<StudioState>((set) => ({
  activeTool: "compress",
  files: [],
  setActiveTool: (activeTool) => set({ activeTool }),
  setFiles: (files) => set({ files }),
  addFiles: (incoming) => set((state) => ({ files: [...state.files, ...incoming] })),
  removeFile: (id) => set((state) => ({ files: state.files.filter((f) => f.id !== id) })),
  reorderFiles: (from, to) =>
    set((state) => {
      if (to < 0 || to >= state.files.length || from < 0 || from >= state.files.length) {
        return state;
      }
      const next = state.files.slice();
      const [moved] = next.splice(from, 1);
      if (!moved) return state;
      next.splice(to, 0, moved);
      return { files: next };
    }),
  clearFiles: () => set({ files: [] }),
}));
