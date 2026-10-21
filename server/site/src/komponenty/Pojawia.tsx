import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Wejście bloku: tylko opacity i transform, raz, bez ruchu przy prefers-reduced-motion.
export function Pojawia({ children, opoznienie = 0, jako = "div", className }: { children: ReactNode; opoznienie?: number; jako?: "div" | "li"; className?: string }) {
  const reduce = useReducedMotion();
  const Element = jako === "li" ? motion.li : motion.div;
  return (
    <Element
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : opoznienie }}
    >
      {children}
    </Element>
  );
}
