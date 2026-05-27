import type { Transition, Variants } from "motion/react";

const CLAY_BEZIER: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const springSoft: Transition = { type: "spring", stiffness: 240, damping: 28, mass: 0.9 };
export const springSnappy: Transition = { type: "spring", stiffness: 440, damping: 34 };
export const springBouncy: Transition = { type: "spring", stiffness: 380, damping: 17 };
export const easeClay: Transition = { duration: 0.5, ease: CLAY_BEZIER };

export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, y: -10, transition: { duration: 0.18 } },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: springBouncy },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

export const sheetUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, y: 28, transition: { duration: 0.2 } },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: springSoft },
};
