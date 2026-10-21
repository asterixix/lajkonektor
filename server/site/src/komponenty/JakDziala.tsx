import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react";
import odjazdy from "../../../test/fixtury/odjazdy.json" with { type: "json" };
import { TRESC } from "../tresc.ts";

const ZRODLA = ["Otwarte Dane UMK", "MSIP", "GUS BDL", "dane.gov.pl", "ZTP GTFS-RT", "OpenStreetMap"];
const WYBRANE = "ZTP GTFS-RT";
const OSTATNI = TRESC.jak.kroki.length - 1;
const KROK_MS = 2400;

// Dane do szczegółów pochodzą z nagranej odpowiedzi narzędzia, nie z wymyślonych liczb.
const wiersze = odjazdy.odjazdy.slice(0, 3);
const opozniony = odjazdy.odjazdy.find((o) => o.opoznienie_s) ?? odjazdy.odjazdy[0];
const odpowiedz = `Linia ${opozniony.linia} w stronę ${opozniony.kierunek} odjeżdża za ${opozniony.za_min} min${opozniony.opoznienie_s ? `, z opóźnieniem ok. ${Math.round(opozniony.opoznienie_s / 60)} min` : ""}.`;

function Szczegol({ i }: { i: number }) {
  if (i === 0) return <p>{TRESC.jak.pytanie}</p>;
  if (i === 1) return <code>{TRESC.jak.wywolanie}</code>;
  if (i === 2) {
    return (
      <ul className="jak-zrodla">
        {ZRODLA.map((z) => <li key={z} data-wybrane={z === WYBRANE ? "tak" : "nie"}>{z}</li>)}
      </ul>
    );
  }
  if (i === 3) {
    return (
      <table className="jak-wiersze">
        <tbody>
          {wiersze.map((o, k) => <tr key={k}><th scope="row">{o.linia}</th><td>{o.kierunek}</td><td>za {o.za_min} min</td></tr>)}
        </tbody>
      </table>
    );
  }
  return <p>{odpowiedz}<br /><strong>Źródło: {TRESC.jak.zrodlo}</strong></p>;
}

// Animacja uruchamia się raz po wejściu w widok. Jest przycisk wstrzymania (WCAG 2.2.2) i odtworzenia od początku.
// Przy prefers-reduced-motion pokazujemy stan końcowy bez ruchu.
export function JakDziala() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const widoczna = useInView(ref, { once: true, amount: 0.3 });
  const [krok, setKrok] = useState(-1);
  const [gra, setGra] = useState(true);

  useEffect(() => {
    if (reduce || !widoczna || !gra || krok >= OSTATNI) return;
    const t = setTimeout(() => setKrok((k) => k + 1), krok < 0 ? 400 : KROK_MS);
    return () => clearTimeout(t);
  }, [reduce, widoczna, gra, krok]);

  const biezacy = reduce ? OSTATNI : krok;
  const pct = biezacy < 0 ? 0 : ((biezacy + 0.5) / TRESC.jak.kroki.length) * 100;
  const koniec = biezacy >= OSTATNI;

  return (
    <section id="jak" className="sekcja" aria-labelledby="jak-tytul">
      <div className="wnetrze" ref={ref}>
        <h2 id="jak-tytul">{TRESC.jak.naglowek}</h2>
        <p className="lead">{TRESC.jak.opis}</p>
        {!reduce && (
          <div className="jak-sterowanie">
            {koniec ? (
              <button type="button" className="przycisk przycisk-maly" onClick={() => { setKrok(-1); setGra(true); }}>
                <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" /> {TRESC.jak.odNowa}
              </button>
            ) : (
              <button type="button" className="przycisk przycisk-maly" onClick={() => setGra((g) => !g)} aria-pressed={!gra}>
                {gra ? <Pause size={18} weight="bold" aria-hidden="true" /> : <Play size={18} weight="bold" aria-hidden="true" />} {gra ? TRESC.jak.wstrzymaj : TRESC.jak.odtworz}
              </button>
            )}
          </div>
        )}
        <div className="jak-tor" aria-hidden="true">
          <motion.div className="jak-tor-wypelnienie" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }} />
          {biezacy >= 0 && <motion.span className="jak-pakiet" initial={false} animate={{ left: `${pct}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }} />}
        </div>
        <ol className="jak-kroki">
          {TRESC.jak.kroki.map((k, i) => (
            <li key={k.etykieta} className="jak-krok" data-stan={i === biezacy ? "aktywny" : i < biezacy ? "zrobiony" : "czeka"} aria-current={i === biezacy ? "step" : undefined}>
              <span className="numer" aria-hidden="true">{i + 1}</span>
              <h3>{k.etykieta}</h3>
              <p>{k.tekst}</p>
              {i <= biezacy && (
                <motion.div className="jak-szczegol" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                  <Szczegol i={i} />
                </motion.div>
              )}
            </li>
          ))}
        </ol>
        <p className="jak-przyklad">{TRESC.jak.przyklad}</p>
      </div>
    </section>
  );
}
