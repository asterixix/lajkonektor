import { useCallback, useState } from "react";
import { Naglowek } from "./komponenty/Naglowek.tsx";
import { Hero } from "./komponenty/Hero.tsx";
import { PasekLiczb } from "./komponenty/PasekLiczb.tsx";
import { JakDziala } from "./komponenty/JakDziala.tsx";
import { Mieszkancy } from "./komponenty/Mieszkancy.tsx";
import { Dlaczego } from "./komponenty/Dlaczego.tsx";
import { TabelaNarzedzi } from "./komponenty/TabelaNarzedzi.tsx";
import { Ograniczenia } from "./komponenty/Ograniczenia.tsx";
import { DlaMiasta } from "./komponenty/DlaMiasta.tsx";
import { Podlaczenie } from "./komponenty/Podlaczenie.tsx";
import { Przyszlosc } from "./komponenty/Przyszlosc.tsx";
import { Stopka } from "./komponenty/Stopka.tsx";
import type { TrybDemo } from "./komponenty/Demo.tsx";
import type { Pytanie } from "./komponenty/Czat.tsx";

export function App() {
  // Kafle „Zapytaj AI" wysyłają pytanie do czatu w hero i przewijają do niego.
  const [tryb, setTryb] = useState<TrybDemo>("czat");
  const [pytanie, setPytanie] = useState<Pytanie | null>(null);
  const zapytaj = useCallback((tekst: string) => {
    setTryb("czat");
    setPytanie((p) => ({ tekst, n: (p?.n ?? 0) + 1 }));
    document.getElementById("demo")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  return (
    <>
      <Naglowek />
      <main id="tresc">
        <Hero tryb={tryb} onTryb={setTryb} pytanie={pytanie} />
        <PasekLiczb />
        <JakDziala />
        <Mieszkancy onZapytaj={zapytaj} />
        <Dlaczego />
        <TabelaNarzedzi />
        <Ograniczenia />
        <DlaMiasta />
        <Podlaczenie />
        <Przyszlosc />
      </main>
      <Stopka />
    </>
  );
}
