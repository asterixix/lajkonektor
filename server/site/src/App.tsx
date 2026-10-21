import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Naglowek } from "./komponenty/Naglowek.tsx";
import { Hero } from "./komponenty/Hero.tsx";
import { TabelaNarzedzi } from "./komponenty/TabelaNarzedzi.tsx";
import { CzegoNieWiemy } from "./komponenty/CzegoNieWiemy.tsx";
import { DlaMiasta } from "./komponenty/DlaMiasta.tsx";
import { Podlaczenie } from "./komponenty/Podlaczenie.tsx";
import { Stopka } from "./komponenty/Stopka.tsx";
import { SESJE } from "./sesje.ts";

// Wejście sekcji: tylko opacity i transform, raz, bez ruchu przy prefers-reduced-motion.
function Wejscie({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function App() {
  return (
    <>
      <Naglowek />
      <main id="tresc">
        <Hero sesje={SESJE} />
        <Wejscie><TabelaNarzedzi /></Wejscie>
        <Wejscie><CzegoNieWiemy /></Wejscie>
        <Wejscie><DlaMiasta /></Wejscie>
        <Wejscie><Podlaczenie /></Wejscie>
      </main>
      <Stopka />
    </>
  );
}
