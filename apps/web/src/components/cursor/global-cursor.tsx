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
  const ringX = useSpring(x, { stiffness: 380, damping: 30, mass: 0.4 });
  const ringY = useSpring(y, { stiffness: 380, damping: 30, mass: 0.4 });

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
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999]">
      <motion.div
        className="absolute size-9 rounded-full border-[1.5px] border-foreground"
        style={{ x: ringX, y: ringY, marginLeft: -18, marginTop: -18 }}
        animate={{
          opacity: visible ? (hot ? 0.9 : 0.5) : 0,
          scale: down ? 0.82 : hot ? 1.75 : 1,
        }}
        transition={{ type: "spring", stiffness: 250, damping: 20 }}
      />
      <motion.div
        className="absolute size-1.5 rounded-full bg-primary ring-2 ring-background/70"
        style={{ x, y, marginLeft: -3, marginTop: -3 }}
        animate={{ opacity: visible && !hot ? 1 : 0, scale: down ? 0.6 : 1 }}
        transition={{ duration: 0.14 }}
      />
    </div>
  );
}
