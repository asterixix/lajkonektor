import { TRESC } from "../tresc.ts";
import { Czat, type Pytanie } from "./Czat.tsx";

// Panel demo w hero: sam czat z modelem. Zakładkę narzędzi bez modelu (Playground.tsx) wyłączono 1.11.2026; plik zostaje do ewentualnego powrotu.
export function Demo({ pytanie }: { pytanie: Pytanie | null }) {
  return (
    <div className="plac" id="demo-panel">
      <h2>{TRESC.hero.demo}</h2>
      <Czat pytanie={pytanie} />
    </div>
  );
}
