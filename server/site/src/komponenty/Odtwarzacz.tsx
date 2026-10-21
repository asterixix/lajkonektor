import { useState } from "react";
import { KartaMostek } from "./KartaMostek.tsx";
import type { Sesja } from "../sesje.ts";
import { TRESC } from "../tresc.ts";

// Nagrane sesje. Zmiana karty tylko po kliknięciu, bez autoodtwarzania (WCAG 2.2.2).
export function Odtwarzacz({ sesje }: { sesje: Sesja[] }) {
  const [aktywna, setAktywna] = useState(0);
  const s = sesje[aktywna];
  return (
    <section aria-labelledby="odtwarzacz-tytul" className="odtwarzacz">
      <h2 id="odtwarzacz-tytul">{TRESC.odtwarzacz.naglowek}</h2>
      <div role="group" aria-label="Pytania do wyboru" className="odtwarzacz-pytania">
        {sesje.map((x, i) => (
          <button key={x.id} type="button" aria-pressed={i === aktywna} onClick={() => setAktywna(i)}>
            {x.pytanie}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="odtwarzacz-wynik">
        <KartaMostek dane={s.wynik} />
      </div>
    </section>
  );
}
