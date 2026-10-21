import { TRESC } from "../tresc.ts";
import { Demo, type TrybDemo } from "./Demo.tsx";
import type { Pytanie } from "./Czat.tsx";

export function Hero({ tryb, onTryb, pytanie }: { tryb: TrybDemo; onTryb: (t: TrybDemo) => void; pytanie: Pytanie | null }) {
  return (
    <section id="demo" className="hero" aria-labelledby="hero-tytul">
      <div className="hero-mapa" aria-hidden="true" />
      <div className="hero-siatka">
        <div className="hero-tekst">
          <h1 id="hero-tytul">{TRESC.hero.naglowek}</h1>
          <p>{TRESC.hero.podtytul}</p>
          <div className="hero-akcje">
            <a className="przycisk przycisk-glowny" href="#podlaczenie">{TRESC.hero.cta}</a>
            <a className="przycisk przycisk-jasny" href="#jak">{TRESC.hero.cta2}</a>
          </div>
        </div>
        <Demo tryb={tryb} onTryb={onTryb} pytanie={pytanie} />
      </div>
    </section>
  );
}
