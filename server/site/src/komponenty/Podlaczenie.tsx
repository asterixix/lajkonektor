import { useId, useState } from "react";
import { TRESC } from "../tresc.ts";
import { adresMcp } from "../adres.ts";
import { Zakladki } from "./Zakladki.tsx";
import { PULA, losuj } from "../pytania.ts";

export function Podlaczenie({ onZapytaj }: { onZapytaj: (pytanie: string) => void }) {
  const t = TRESC.podlaczenie;
  const id = useId();
  const adres = adresMcp(window.location.origin);
  const [komunikat, setKomunikat] = useState("");
  const [klient, setKlient] = useState(t.klienci[0].id);
  const [pytania] = useState(() => losuj(PULA, 4));
  const k = t.klienci.find((x) => x.id === klient)!;
  const otworz = async () => {
    window.open(klient === "claude" ? "https://claude.ai/settings/connectors" : klient === "chatgpt" ? "https://chatgpt.com/" : "https://www.perplexity.ai/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(adres);
      setKomunikat(`Skopiowano adres. W ${k.nazwa} dodaj konektor według instrukcji poniżej i potwierdź dostęp.`);
    } catch { setKomunikat("Otwarto klienta. Skopiuj widoczny adres ręcznie i dodaj konektor według instrukcji poniżej."); }
  };

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
                <button type="button" className="przycisk przycisk-glowny" onClick={otworz}>Kopiuj adres i otwórz {k.nazwa}</button>
                <p className="zrodlo">Ten przycisk rozpoczyna konfigurację. Klient wymaga własnego potwierdzenia dodania serwera; nie instalujemy połączenia automatycznie.</p>
                <ol>{k.kroki.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
            </Zakladki>
          </div>
          <div>
            <h3>{t.probne}</h3>
            <ul className="pytania-probne">
              {pytania.map((p) => <li key={p.tekst}><button type="button" onClick={() => onZapytaj(p.tekst)}>{p.tekst}</button></li>)}
            </ul>
            <p><a className="przycisk przycisk-jasny" href="?raport=1">Otwórz zapisany raport</a></p>
          </div>
        </div>
      </div>
    </section>
  );
}
