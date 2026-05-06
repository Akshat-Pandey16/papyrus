import { create } from "zustand";

type Theme = "light" | "dark" | "system";

type UiState = {
  theme: Theme;
  sidebarOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  theme: "system",
  sidebarOpen: true,
  setTheme: (theme) => set({ theme }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
