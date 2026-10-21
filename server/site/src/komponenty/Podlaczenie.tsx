import { useState } from "react";
import { TRESC } from "../tresc.ts";
import { adresMcp } from "../adres.ts";

export function Podlaczenie() {
  const adres = adresMcp(window.location.origin);
  const [skopiowano, setSkopiowano] = useState(false);

  async function kopiuj() {
    await navigator.clipboard.writeText(adres);
    setSkopiowano(true);
  }

  return (
    <section id="podlaczenie" aria-labelledby="podlaczenie-tytul" className="podlaczenie">
      <h2 id="podlaczenie-tytul">{TRESC.podlaczenie.naglowek}</h2>
      <ol>
        {TRESC.podlaczenie.kroki.map((k) => <li key={k}>{k}</li>)}
      </ol>
      <div className="podlaczenie-adres">
        <code>{adres}</code>
        <button type="button" className="przycisk" onClick={kopiuj}>{TRESC.podlaczenie.kopiuj}</button>
      </div>
      <p aria-live="polite">{skopiowano ? TRESC.podlaczenie.skopiowano : ""}</p>
    </section>
  );
}
