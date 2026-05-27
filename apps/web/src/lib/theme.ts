export type Theme = "light" | "dark" | "system";

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#1c1018" : "#fbeff0");
}

export type ThemeWash = { theme: Theme; commit: () => void; x: number; y: number };

let washHandler: ((w: ThemeWash) => void) | null = null;

export function registerThemeWash(fn: ((w: ThemeWash) => void) | null): void {
  washHandler = fn;
}

export function runThemeTransition(
  theme: Theme,
  commit: () => void,
  origin?: { x: number; y: number },
): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !washHandler) {
    applyTheme(theme);
    commit();
    return;
  }
  washHandler({
    theme,
    commit,
    x: origin?.x ?? window.innerWidth / 2,
    y: origin?.y ?? window.innerHeight / 2,
  });
}
