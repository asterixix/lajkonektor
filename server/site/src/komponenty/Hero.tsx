import { TRESC } from "../tresc.ts";
import { Odtwarzacz } from "./Odtwarzacz.tsx";
import { PoleZapytania } from "./PoleZapytania.tsx";
import { KartaMostek } from "./KartaMostek.tsx";
import { useState } from "react";
import type { Sesja } from "../sesje.ts";

export function Hero({ sesje }: { sesje: Sesja[] }) {
  const [zywy, setZywy] = useState<any | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  return (
    <section id="top" className="hero" aria-labelledby="hero-tytul">
      <div className="hero-tekst">
        <h1 id="hero-tytul">{TRESC.hero.naglowek}</h1>
        <p>{TRESC.hero.podtytul}</p>
        <a className="przycisk przycisk-glowny" href="#podlaczenie">{TRESC.hero.cta}</a>
      </div>
      <div className="hero-demo">
        <Odtwarzacz sesje={sesje} />
        <PoleZapytania onWynik={(d) => { setBlad(null); setZywy(d); }} onBlad={(e) => { setZywy(null); setBlad(e.message); }} />
        {blad && <p role="alert">{blad} Wybierz jedno z pytań powyżej.</p>}
        {zywy && <div aria-live="polite"><KartaMostek dane={zywy} /></div>}
      </div>
    </section>
  );
}
