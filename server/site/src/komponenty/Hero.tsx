import { TRESC } from "../tresc.ts";
import { Demo } from "./Demo.tsx";
import type { Pytanie } from "./Czat.tsx";
import { useState } from "react";
import { MiastoAnimacja, PolaczenieAnimacja } from "./MiastoAnimacja.tsx";

export function Hero({ pytanie }: { pytanie: Pytanie | null }) {
  const [pauza, setPauza] = useState(false);
  return (
    <section id="demo" className={`hero${pauza ? " animacja-pauza" : ""}`} aria-labelledby="hero-tytul">
      <MiastoAnimacja />
      <div className="hero-siatka">
        <div className="hero-tekst">
          <h1 id="hero-tytul">{TRESC.hero.naglowek}</h1>
          <p>{TRESC.hero.podtytul}</p>
          <div className="hero-akcje">
            <a className="przycisk przycisk-glowny" href="#podlaczenie">{TRESC.hero.cta}</a>
            <a className="przycisk przycisk-jasny" href="#jak">{TRESC.hero.cta2}</a>
          </div>
          <PolaczenieAnimacja />
          <button type="button" className="ruch-pauza" aria-pressed={pauza} onClick={() => setPauza(!pauza)}>{pauza ? "Wznów animację" : "Wstrzymaj animację"}</button>
        </div>
        <Demo pytanie={pytanie} />
      </div>
    </section>
  );
}
