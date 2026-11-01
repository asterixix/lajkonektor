import { TRESC } from "../tresc.ts";
import { Pojawia } from "./Pojawia.tsx";

export function DlaMiasta() {
  const t = TRESC.dlaMiasta;
  return (
    <div className="rozwiniecie">
        <p className="lead">{t.opis}</p>
        <ul className="dm-siatka">
          {t.bloki.map((b, i) => (
            <Pojawia key={b.etykieta} jako="li" className="kafel" opoznienie={(i % 3) * 0.08}>
              <p className="kafel-etykieta">{b.etykieta}</p>
              <h3>{b.naglowek}</h3>
              <p>{b.tekst}</p>
              <p className="kafel-zrodla">Źródło: {b.zrodla.map((z) => <a key={z.url} href={z.url}>{z.tekst}</a>)}</p>
            </Pojawia>
          ))}
        </ul>
    </div>
  );
}
