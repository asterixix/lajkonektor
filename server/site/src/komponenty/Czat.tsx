import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowCounterClockwise, PaperPlaneRight, Shuffle, Stop } from "@phosphor-icons/react";
import { domknij, historiaDoApi, nowaWiadomosc, skrotArgumentow, wyslijCzat, zastosuj, type Karta, type Wiadomosc } from "../czatKlient.ts";
import { renderujMarkdown } from "../markdown.ts";
import { TRESC } from "../tresc.ts";
import { PULA, losuj } from "../pytania.ts";
import { KartaMostek } from "./KartaMostek.tsx";

export interface Pytanie { tekst: string; n: number }

const BEZ_MODELU = new Set(["brak_klucza", "konfiguracja", "limit"]);
const LIMIT_PYTAN_W_ROZMOWIE = 5;

// Długie argumenty (np. cała seria danych do prognozy) chowamy pod rozwijanym podglądem, żeby nie zasłaniały karty.
function KartaNarzedzia({ k }: { k: Karta }) {
  return (
    <div className="czat-karta">
      <details className="czat-wywolanie">
        <summary><span>Narzędzie MCP:</span> <code>{k.nazwa}</code> <span className="czat-argumenty">{skrotArgumentow(k.argumenty)}</span></summary>
        <pre><code>{`${k.nazwa}(${JSON.stringify(k.argumenty, null, 2)})`}</code></pre>
      </details>
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

// Odpowiedź modelu to markdown (nagłówki, listy, tabele, kod, linki). HTML powstaje w markdown.ts, gdzie surowy HTML jest wyłączony.
function Tekst({ t }: { t: string }) {
  const html = useMemo(() => renderujMarkdown(t), [t]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Status({ w }: { w: Wiadomosc }) {
  const czeka = w.karty.find((k) => k.stan === "czeka");
  return <p className="czat-status" role="status">{czeka ? `Wywołuję narzędzie ${czeka.nazwa}…` : w.karty.length ? "Model układa odpowiedź…" : "Model wybiera narzędzie…"}</p>;
}

// Czat z modelem: odpowiedzi składa model, ale liczby i karty pochodzą z narzędzi MCP, więc przy każdej odpowiedzi widać, skąd są dane.
export function Czat({ pytanie }: { pytanie: Pytanie | null }) {
  const id = useId();
  const [wiadomosci, setWiadomosci] = useState<Wiadomosc[]>([]);
  const [tekst, setTekst] = useState("");
  const [przyklady, setPrzyklady] = useState(() => losuj(PULA, 3));
  const [dostepny, setDostepny] = useState<boolean | null>(null);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const biezace = useRef(wiadomosci);
  biezace.current = wiadomosci;
  const laduje = wiadomosci.at(-1)?.laduje === true;
  const limitPytanOsiagniety = wiadomosci.filter((m) => m.rola === "uzytkownik").length >= LIMIT_PYTAN_W_ROZMOWIE;

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
  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/czat", { signal: ac.signal }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d && typeof d.dostepny === "boolean") setDostepny(d.dostepny);
    }).catch(() => {});
    return () => ac.abort();
  }, []);
  useEffect(() => {
    const element = log.current;
    const wybrano = (e: Event) => { const t = (e as CustomEvent).detail; if (typeof t === "string") void wyslij(t); };
    element?.addEventListener("lajkonektor:wybor", wybrano);
    return () => element?.removeEventListener("lajkonektor:wybor", wybrano);
  }, []);

  const wyslijFormularz = (e: FormEvent) => { e.preventDefault(); void wyslij(tekst); };
  const klawisz = (e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void wyslij(tekst); } };
  const ostatniaUzytkownika = [...wiadomosci].reverse().find((m) => m.rola === "uzytkownik")?.tresc;

  return (
    <div className="czat">
      {dostepny === false && <p role="status">Czat z modelem jest obecnie niedostępny. Możesz <a href="#podlaczenie">podłączyć Lajkonektor do własnego AI</a>.</p>}
      <div ref={log} className="czat-log" role="log" aria-live="polite" aria-label="Rozmowa z asystentem" tabIndex={0}>
        {wiadomosci.length === 0 && (
          <div className="czat-start">
            <p>Zadaj pytanie po polsku. Asystent sam wybierze narzędzia Lajkonektora i pokaże wynik na karcie, razem ze źródłem.</p>
            <ul className="czat-przyklady">
              {przyklady.map((p) => <li key={p.tekst}><button type="button" onClick={() => void wyslij(p.tekst)}>{p.tekst}</button></li>)}
            </ul>
            <button type="button" className="czat-losuj" onClick={() => setPrzyklady(losuj(PULA, 3))}><Shuffle size={18} weight="bold" aria-hidden="true" /> Inne przykłady</button>
          </div>
        )}
        {wiadomosci.map((m, i) => (
          <div key={i} className={m.rola === "uzytkownik" ? "czat-wiad czat-uzytkownik" : "czat-wiad czat-asystent"}>
            <p className="czat-autor">{m.rola === "uzytkownik" ? "Ty" : "Asystent Lajkonektora"}</p>
            {m.karty.map((k) => <KartaNarzedzia key={k.id} k={k} />)}
            {m.tresc && (m.rola === "asystent" ? <div className="czat-tresc"><Tekst t={m.tresc} /></div> : <p className="czat-tresc">{m.tresc}</p>)}
            {m.laduje && <Status w={m} />}
            {m.blad && (
              <div className="czat-blad" role="alert">
                <p>{m.blad.komunikat}</p>
                <div className="czat-akcje">
                  {m.blad.kod === "limit_rozmowy"
                    ? <button type="button" className="przycisk przycisk-maly" onClick={() => setWiadomosci([])}>Rozpocznij nową rozmowę</button>
                    : m.blad.kod && BEZ_MODELU.has(m.blad.kod)
                    ? <a className="przycisk przycisk-maly" href="#podlaczenie">Podłącz do własnego AI</a>
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
          <textarea id={`${id}-pole`} rows={2} maxLength={1000} value={tekst} onChange={(e) => setTekst(e.target.value)} onKeyDown={klawisz} disabled={laduje || limitPytanOsiagniety} />
          {laduje
            ? <button type="button" className="przycisk" onClick={() => abort.current?.abort()}><Stop size={18} weight="bold" aria-hidden="true" /> Zatrzymaj</button>
            : <button type="submit" className="przycisk przycisk-glowny" disabled={!tekst.trim() || limitPytanOsiagniety}><PaperPlaneRight size={18} weight="bold" aria-hidden="true" /> Wyślij</button>}
        </div>
        <div className="czat-stopka">
          <span>{TRESC.hero.czat.info}</span>
          {limitPytanOsiagniety && <span role="status">Wykorzystano 5 pytań. Rozpocznij nową rozmowę, aby zapytać ponownie.</span>}
          {wiadomosci.length > 0 && !laduje && (
            <button type="button" className="czat-nowa" onClick={() => setWiadomosci([])}><ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" /> Nowa rozmowa</button>
          )}
        </div>
      </form>
    </div>
  );
}
