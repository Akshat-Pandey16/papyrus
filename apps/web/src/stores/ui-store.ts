import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

type ToolPrefs = {
  compressionLevel: string | null;
  ocrLanguage: string | null;
};

type UiState = {
  theme: Theme;
  sidebarCollapsed: boolean;
  zeroRetention: boolean;
  toolPrefs: ToolPrefs;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setZeroRetention: (enabled: boolean) => void;
  setToolPref: <K extends keyof ToolPrefs>(key: K, value: ToolPrefs[K]) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarCollapsed: false,
      zeroRetention: false,
      toolPrefs: { compressionLevel: null, ocrLanguage: null },
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setZeroRetention: (zeroRetention) => set({ zeroRetention }),
      setToolPref: (key, value) => set((s) => ({ toolPrefs: { ...s.toolPrefs, [key]: value } })),
    }),
    {
      name: "papyrus.ui.v1",
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        zeroRetention: s.zeroRetention,
        toolPrefs: s.toolPrefs,
      }),
      version: 1,
    },
  ),
);
