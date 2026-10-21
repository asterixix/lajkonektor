import { TRESC } from "../tresc.ts";
import { Pojawia } from "./Pojawia.tsx";

export function Przyszlosc() {
  const t = TRESC.przyszlosc;
  return (
    <section id="dalej" className="sekcja t-szare" aria-labelledby="dalej-tytul">
      <div className="wnetrze">
        <h2 id="dalej-tytul">{t.naglowek}</h2>
        <p className="lead">{t.opis}</p>
        <ul className="kafle dwie">
          {t.kierunki.map((k, i) => (
            <Pojawia key={k.etykieta} jako="li" className="kafel" opoznienie={(i % 2) * 0.08}>
              <p className="kafel-etykieta">{k.etykieta}</p>
              <h3>{k.naglowek}</h3>
              <span className="kafel-plan">{t.plan}</span>
              <p>{k.tekst}</p>
              {k.zrodla.length > 0 && <p className="kafel-zrodla">Źródło: {k.zrodla.map((z) => <a key={z.url} href={z.url}>{z.tekst}</a>)}</p>}
            </Pojawia>
          ))}
        </ul>
        <Pojawia className="zamkniecie">
          <h3>{t.teza.naglowek}</h3>
          <p>{t.teza.tekst}</p>
          <p className="zrodlo">{t.uwaga}</p>
        </Pojawia>
      </div>
    </section>
  );
}
