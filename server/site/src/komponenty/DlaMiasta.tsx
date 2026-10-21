import { TRESC } from "../tresc.ts";
import { Pojawia } from "./Pojawia.tsx";

export function DlaMiasta() {
  const t = TRESC.dlaMiasta;
  return (
    <section id="dla-miasta" className="sekcja t-szare" aria-labelledby="dla-miasta-tytul">
      <div className="wnetrze">
        <h2 id="dla-miasta-tytul">{t.naglowek}</h2>
        <p className="lead">{t.opis}</p>
        <ul className="dm-siatka">
          {t.bloki.map((b, i) => (
            <Pojawia key={b.etykieta} jako="li" className="kafel" opoznienie={(i % 3) * 0.08}>
              <p className="kafel-etykieta">{b.etykieta}</p>
              <h3>{b.naglowek}</h3>
              {b.etykieta === "Koszt" && (
                <div className="dm-kwoty">
                  <div><strong>ok. 6 USD</strong><span>miesięcznie, 100 tys. zapytań dziennie (szacunek)</span></div>
                  <div><strong>ok. 8 USD</strong><span>miesięcznie, 200 tys. zapytań dziennie (szacunek)</span></div>
                </div>
              )}
              <p>{b.tekst}</p>
              <p className="kafel-zrodla">Źródło: {b.zrodla.map((z) => <a key={z.url} href={z.url}>{z.tekst}</a>)}</p>
            </Pojawia>
          ))}
        </ul>
      </div>
    </section>
  );
}
