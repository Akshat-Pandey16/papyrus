import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";

const INTERACTIVE =
  "a,button,[role=button],[role=radio],[data-cursor],input,textarea,select,label,summary";

export function GlobalCursor() {
  const [enabled] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches &&
      window.matchMedia("(hover: hover)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 320, damping: 26, mass: 0.45 });
  const ringY = useSpring(y, { stiffness: 320, damping: 26, mass: 0.45 });

  const [visible, setVisible] = useState(false);
  const [hot, setHot] = useState(false);
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("custom-cursor");

    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
    };
    const onOver = (e: PointerEvent) => {
      const t = e.target;
      setHot(t instanceof Element && !!t.closest(INTERACTIVE));
    };
    const onDown = () => setDown(true);
    const onUp = () => setDown(false);
    const onLeave = () => setVisible(false);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      root.classList.remove("custom-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      <motion.div
        className="absolute size-8 rounded-full border border-primary"
        style={{ x: ringX, y: ringY, marginLeft: -16, marginTop: -16 }}
        animate={{ opacity: visible ? (hot ? 1 : 0.55) : 0, scale: down ? 0.85 : hot ? 1.7 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      />
      <motion.div
        className="absolute size-2 rounded-full bg-molten"
        style={{ x, y, marginLeft: -4, marginTop: -4 }}
        animate={{ opacity: visible ? 1 : 0, scale: down ? 0.5 : hot ? 0.4 : 1 }}
        transition={{ duration: 0.12 }}
      />
    </div>
  );
}
