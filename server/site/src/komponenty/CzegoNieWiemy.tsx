import { TRESC } from "../tresc.ts";

export function CzegoNieWiemy() {
  return (
    <section id="czego-nie-wiemy" aria-labelledby="czego-tytul" className="czego-nie-wiemy">
      <h2 id="czego-tytul">{TRESC.czegoNieWiemy.naglowek}</h2>
      <p>{TRESC.czegoNieWiemy.opis}</p>
    </section>
  );
}
