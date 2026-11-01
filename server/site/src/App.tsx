import { useCallback, useState } from "react";
import { Naglowek } from "./komponenty/Naglowek.tsx";
import { Hero } from "./komponenty/Hero.tsx";
import { JakDziala } from "./komponenty/JakDziala.tsx";
import { Ograniczenia } from "./komponenty/Ograniczenia.tsx";
import { Podlaczenie } from "./komponenty/Podlaczenie.tsx";
import { Przyszlosc } from "./komponenty/Przyszlosc.tsx";
import { Stopka } from "./komponenty/Stopka.tsx";
import type { Pytanie } from "./komponenty/Czat.tsx";
import { CzytnikRaportu } from "./komponenty/CzytnikRaportu.tsx";
import { Podglad } from "./komponenty/Podglad.tsx";

export function App() {
  // Przykładowe pytania z sekcji podłączenia trafiają do czatu w hero i przewijają do niego.
  const [pytanie, setPytanie] = useState<Pytanie | null>(null);
  const zapytaj = useCallback((tekst: string) => {
    setPytanie((p) => ({ tekst, n: (p?.n ?? 0) + 1 }));
    document.getElementById("demo")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("raport") === "1") return <CzytnikRaportu />;
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("podglad") === "1") return <Podglad />;

  return (
    <>
      <Naglowek />
      <main id="tresc">
        <Hero pytanie={pytanie} />
        <JakDziala />
        <Ograniczenia />
        <Podlaczenie onZapytaj={zapytaj} />
        <Przyszlosc />
      </main>
      <Stopka />
    </>
  );
}
