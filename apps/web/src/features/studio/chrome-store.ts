import { create } from "zustand";

type ChromeState = {
  launcherOpen: boolean;
  resultsOpen: boolean;
  setLauncherOpen: (open: boolean) => void;
  toggleLauncher: () => void;
  setResultsOpen: (open: boolean) => void;
};

export const useStudioChrome = create<ChromeState>((set) => ({
  launcherOpen: false,
  resultsOpen: false,
  setLauncherOpen: (launcherOpen) => set({ launcherOpen }),
  toggleLauncher: () => set((s) => ({ launcherOpen: !s.launcherOpen })),
  setResultsOpen: (resultsOpen) => set({ resultsOpen }),
}));
