import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { applyTheme, registerThemeWash, type Theme } from "@/lib/theme";

type Flash = { theme: Theme; x: number; y: number; key: number };

export function ThemeFlash() {
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    registerThemeWash((w) => {
      setFlash({ theme: w.theme, x: w.x, y: w.y, key: Date.now() });
      window.setTimeout(() => {
        applyTheme(w.theme);
        w.commit();
      }, 200);
    });
    return () => registerThemeWash(null);
  }, []);

  return (
    <AnimatePresence>
      {flash ? (
        <motion.div
          key={flash.key}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[9998]"
          style={{
            background: `radial-gradient(circle at ${flash.x}px ${flash.y}px, var(--color-ember), var(--color-primary) 38%, var(--color-oxblood) 96%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.96, 0.96, 0] }}
          transition={{ duration: 0.62, times: [0, 0.32, 0.55, 1], ease: [0.32, 0.72, 0, 1] }}
          onAnimationComplete={() => setFlash(null)}
        />
      ) : null}
    </AnimatePresence>
  );
}
