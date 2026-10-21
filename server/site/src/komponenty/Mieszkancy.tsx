import { TRESC } from "../tresc.ts";
import { Pojawia } from "./Pojawia.tsx";

export function Mieszkancy({ onZapytaj }: { onZapytaj: (pytanie: string) => void }) {
  const t = TRESC.mieszkancy;
  return (
    <section id="mieszkancy" className="sekcja t-szare" aria-labelledby="mieszkancy-tytul">
      <div className="wnetrze">
        <h2 id="mieszkancy-tytul">{t.naglowek}</h2>
        <p className="lead">{t.opis} <a href={t.zrodlo.url}>{t.zrodlo.tekst}</a></p>
        <ul className="kafle">
          {t.kafle.map((k, i) => (
            <Pojawia key={k.pytanie} jako="li" className="kafel" opoznienie={(i % 3) * 0.08}>
              <code>{k.narzedzie}</code>
              <h3>{k.pytanie}</h3>
              <p>{k.korzysc}</p>
              <button type="button" className="przycisk przycisk-maly" onClick={() => onZapytaj(k.pytanieAi)}>{t.sprawdz}</button>
            </Pojawia>
          ))}
        </ul>
      </div>
    </section>
  );
}
