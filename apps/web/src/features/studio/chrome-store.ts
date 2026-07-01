import { create } from "zustand";

type ChromeState = {
  launcherOpen: boolean;
  resultsOpen: boolean;
  dismissedJobKeys: string[];
  setLauncherOpen: (open: boolean) => void;
  toggleLauncher: () => void;
  setResultsOpen: (open: boolean) => void;
  dismissJob: (key: string) => void;
};

export const useStudioChrome = create<ChromeState>((set) => ({
  launcherOpen: false,
  resultsOpen: false,
  dismissedJobKeys: [],
  setLauncherOpen: (launcherOpen) => set({ launcherOpen }),
  toggleLauncher: () => set((s) => ({ launcherOpen: !s.launcherOpen })),
  setResultsOpen: (resultsOpen) => set({ resultsOpen }),
  dismissJob: (key) =>
    set((s) =>
      s.dismissedJobKeys.includes(key)
        ? s
        : { dismissedJobKeys: [...s.dismissedJobKeys, key].slice(-50) },
    ),
}));
