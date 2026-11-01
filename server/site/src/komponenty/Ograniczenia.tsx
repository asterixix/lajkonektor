import { TRESC } from "../tresc.ts";
import { PasekLiczb } from "./PasekLiczb.tsx";
import { KatalogNarzedzi } from "./TabelaNarzedzi.tsx";

// Część 2 strony: skąd są dane i czego prototyp nie robi. Szczegóły są zwinięte, żeby nie przeładować pierwszego czytania.
export function Ograniczenia() {
  const t = TRESC.ograniczenia;
  return (
    <section id="zrodla" className="sekcja t-szare" aria-labelledby="zrodla-tytul">
      <div className="wnetrze">
        <h2 id="zrodla-tytul">{t.naglowek}</h2>
        <p className="lead">{t.opis}</p>
        <PasekLiczb />
        <ul className="limity">
          {t.limity.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <details className="reszta">
          <summary>{TRESC.rozkladNarzedzi.reszta}</summary>
          <KatalogNarzedzi />
        </details>
      </div>
    </section>
  );
}
