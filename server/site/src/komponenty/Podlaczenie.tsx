import { useId, useState } from "react";
import { TRESC } from "../tresc.ts";
import { adresMcp } from "../adres.ts";
import { Zakladki } from "./Zakladki.tsx";

export function Podlaczenie() {
  const t = TRESC.podlaczenie;
  const id = useId();
  const adres = adresMcp(window.location.origin);
  const [komunikat, setKomunikat] = useState("");
  const [klient, setKlient] = useState(t.klienci[0].id);
  const k = t.klienci.find((x) => x.id === klient)!;

  async function kopiuj() {
    try {
      await navigator.clipboard.writeText(adres);
      setKomunikat(t.skopiowano);
    } catch {
      setKomunikat(t.blad);
    }
  }

  return (
    <section id="podlaczenie" className="sekcja" aria-labelledby="podlaczenie-tytul">
      <div className="wnetrze">
        <h2 id="podlaczenie-tytul">{t.naglowek}</h2>
        <div className="podl-siatka">
          <div>
            <ol className="kroki">
              {t.kroki.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <div className="podl-adres">
              <code>{adres}</code>
              <button type="button" className="przycisk przycisk-glowny" onClick={kopiuj}>{t.kopiuj}</button>
            </div>
            <p aria-live="polite" className="zrodlo">{komunikat}</p>
            <Zakladki idBazowe={id} etykieta="Klient AI" pozycje={t.klienci.map((x) => ({ id: x.id, etykieta: x.nazwa }))} aktywna={klient} onZmiana={setKlient}>
              <div className="panel-klienta">
                <ol>{k.kroki.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
            </Zakladki>
          </div>
          <div>
            <h3>{t.probne}</h3>
            <ul className="pytania-probne">
              {t.pytania.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
