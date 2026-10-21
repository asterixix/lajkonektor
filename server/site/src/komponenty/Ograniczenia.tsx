import { TRESC } from "../tresc.ts";
import { SESJE } from "../sesje.ts";
import { KartaMostek } from "./KartaMostek.tsx";
import { Pojawia } from "./Pojawia.tsx";

const prognoza = SESJE.find((s) => s.id === "prognoza")!;

export function Ograniczenia() {
  const t = TRESC.ograniczenia;
  return (
    <section id="ograniczenia" className="sekcja" aria-labelledby="ograniczenia-tytul">
      <div className="wnetrze">
        <h2 id="ograniczenia-tytul">{t.naglowek}</h2>
        <div className="czego-siatka">
          <div>
            <p className="lead">{t.opis}</p>
            <ul className="limity">
              {t.limity.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
          <Pojawia>
            <p className="karta-tytul">{t.przyklad}</p>
            <div className="karta-ramka" role="region" aria-label={prognoza.pytanie}>
              <KartaMostek dane={prognoza.wynik} />
            </div>
          </Pojawia>
        </div>
      </div>
    </section>
  );
}
