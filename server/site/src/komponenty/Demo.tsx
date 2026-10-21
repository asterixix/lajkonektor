import { useId } from "react";
import { TRESC } from "../tresc.ts";
import { Czat, type Pytanie } from "./Czat.tsx";
import { Playground } from "./Playground.tsx";
import { Zakladki } from "./Zakladki.tsx";

export type TrybDemo = "czat" | "narzedzia";

// Panel demo w hero: czat z modelem i narzędzia bez modelu. Oba zostają zamontowane, żeby przełączenie nie kasowało rozmowy.
export function Demo({ tryb, onTryb, pytanie }: { tryb: TrybDemo; onTryb: (t: TrybDemo) => void; pytanie: Pytanie | null }) {
  const id = useId();
  return (
    <div className="plac" id="demo-panel">
      <h2>{TRESC.hero.demo}</h2>
      <Zakladki idBazowe={id} etykieta="Tryb demo" pozycje={[{ id: "czat", etykieta: "Czat z AI" }, { id: "narzedzia", etykieta: "Narzędzia bez modelu" }]} aktywna={tryb} onZmiana={(t) => onTryb(t as TrybDemo)}>
        <div hidden={tryb !== "czat"}><Czat pytanie={pytanie} onNarzedzia={() => onTryb("narzedzia")} /></div>
        <div hidden={tryb !== "narzedzia"}><Playground /></div>
      </Zakladki>
    </div>
  );
}
