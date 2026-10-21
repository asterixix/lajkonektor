import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowCounterClockwise, PaperPlaneRight, Stop } from "@phosphor-icons/react";
import { domknij, historiaDoApi, nowaWiadomosc, wyslijCzat, zastosuj, type Karta, type Wiadomosc } from "../czatKlient.ts";
import { TRESC } from "../tresc.ts";
import { KartaMostek } from "./KartaMostek.tsx";

export interface Pytanie { tekst: string; n: number }

const BEZ_MODELU = new Set(["brak_klucza", "konfiguracja", "limit"]);
const podpis = (k: Karta) => `${k.nazwa}(${JSON.stringify(k.argumenty)})`;

function KartaNarzedzia({ k }: { k: Karta }) {
  return (
    <div className="czat-karta">
      <p className="czat-wywolanie"><span>Narzędzie MCP:</span> <code>{podpis(k)}</code></p>
      {k.stan === "czeka" && <p className="czat-czeka">Czekam na wynik z serwera…</p>}
      {k.stan === "blad" && <p className="czat-blad-narzedzia">Narzędzie zwróciło błąd: {k.blad}</p>}
      {k.stan === "ok" && k.dane && (
        <div className="karta-ramka" tabIndex={0} role="region" aria-label={`Wynik narzędzia ${k.nazwa}`}>
          <KartaMostek dane={k.dane} />
        </div>
      )}
    </div>
  );
}

function Status({ w }: { w: Wiadomosc }) {
  const czeka = w.karty.find((k) => k.stan === "czeka");
  return <p className="czat-status" role="status">{czeka ? `Wywołuję narzędzie ${czeka.nazwa}…` : w.karty.length ? "Model układa odpowiedź…" : "Model wybiera narzędzie…"}</p>;
}

// Czat z modelem: odpowiedzi składa model, ale liczby i karty pochodzą z narzędzi MCP, więc przy każdej odpowiedzi widać, skąd są dane.
export function Czat({ pytanie, onNarzedzia }: { pytanie: Pytanie | null; onNarzedzia: () => void }) {
  const id = useId();
  const [wiadomosci, setWiadomosci] = useState<Wiadomosc[]>([]);
  const [tekst, setTekst] = useState("");
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const biezace = useRef(wiadomosci);
  biezace.current = wiadomosci;
  const laduje = wiadomosci.at(-1)?.laduje === true;

  async function wyslij(t: string, ponow = false) {
    const tresc = t.trim();
    if (!tresc || biezace.current.at(-1)?.laduje) return;
    const poprzednie = ponow ? biezace.current.slice(0, -2) : biezace.current;
    const historia = [...historiaDoApi(poprzednie), { rola: "uzytkownik", tresc }];
    setWiadomosci([...poprzednie, nowaWiadomosc("uzytkownik", tresc), nowaWiadomosc("asystent", "")]);
    setTekst("");
    const ac = new AbortController();
    abort.current = ac;
    const zmien = (f: (m: Wiadomosc) => Wiadomosc) => setWiadomosci((w) => w.map((m, i) => (i === w.length - 1 ? f(m) : m)));
    try {
      const wynik = await wyslijCzat(historia, (z) => zmien((m) => zastosuj(m, z)), ac.signal);
      if (wynik.status !== 200) zmien((m) => ({ ...m, laduje: false, blad: { komunikat: wynik.blad ?? "Serwer zwrócił błąd.", kod: wynik.kod } }));
      else zmien((m) => (m.laduje ? domknij(m, false) : m));
    } catch {
      zmien((m) => domknij(m, true));
    } finally {
      abort.current = null;
    }
  }

  useEffect(() => { if (pytanie) void wyslij(pytanie.tekst); }, [pytanie?.n]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [wiadomosci]);
  useEffect(() => () => abort.current?.abort(), []);

  const wyslijFormularz = (e: FormEvent) => { e.preventDefault(); void wyslij(tekst); };
  const klawisz = (e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void wyslij(tekst); } };
  const ostatniaUzytkownika = [...wiadomosci].reverse().find((m) => m.rola === "uzytkownik")?.tresc;

  return (
    <div className="czat">
      <div ref={log} className="czat-log" role="log" aria-live="polite" aria-label="Rozmowa z asystentem" tabIndex={0}>
        {wiadomosci.length === 0 && (
          <div className="czat-start">
            <p>Zadaj pytanie po polsku. Asystent sam wybierze narzędzia Lajkonektora i pokaże wynik na karcie, razem ze źródłem.</p>
            <ul className="czat-przyklady">
              {TRESC.hero.czat.przyklady.map((p) => <li key={p}><button type="button" onClick={() => void wyslij(p)}>{p}</button></li>)}
            </ul>
          </div>
        )}
        {wiadomosci.map((m, i) => (
          <div key={i} className={m.rola === "uzytkownik" ? "czat-wiad czat-uzytkownik" : "czat-wiad czat-asystent"}>
            <p className="czat-autor">{m.rola === "uzytkownik" ? "Ty" : "Asystent Lajkonektora"}</p>
            {m.karty.map((k) => <KartaNarzedzia key={k.id} k={k} />)}
            {m.tresc && <p className="czat-tresc">{m.tresc}</p>}
            {m.laduje && <Status w={m} />}
            {m.blad && (
              <div className="czat-blad" role="alert">
                <p>{m.blad.komunikat}</p>
                <div className="czat-akcje">
                  {m.blad.kod && BEZ_MODELU.has(m.blad.kod)
                    ? <button type="button" className="przycisk przycisk-maly" onClick={onNarzedzia}>Użyj narzędzi bez modelu</button>
                    : ostatniaUzytkownika && i === wiadomosci.length - 1 && <button type="button" className="przycisk przycisk-maly" onClick={() => void wyslij(ostatniaUzytkownika, true)}>Spróbuj ponownie</button>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="czat-formularz" onSubmit={wyslijFormularz} noValidate>
        <label htmlFor={`${id}-pole`}>Zadaj pytanie o Kraków</label>
        <div className="czat-wiersz">
          <textarea id={`${id}-pole`} rows={2} maxLength={1000} value={tekst} onChange={(e) => setTekst(e.target.value)} onKeyDown={klawisz} disabled={laduje} />
          {laduje
            ? <button type="button" className="przycisk" onClick={() => abort.current?.abort()}><Stop size={18} weight="bold" aria-hidden="true" /> Zatrzymaj</button>
            : <button type="submit" className="przycisk przycisk-glowny" disabled={!tekst.trim()}><PaperPlaneRight size={18} weight="bold" aria-hidden="true" /> Wyślij</button>}
        </div>
        <div className="czat-stopka">
          <span>{TRESC.hero.czat.info}</span>
          {wiadomosci.length > 0 && !laduje && (
            <button type="button" className="czat-nowa" onClick={() => setWiadomosci([])}><ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" /> Nowa rozmowa</button>
          )}
        </div>
      </form>
    </div>
  );
}
