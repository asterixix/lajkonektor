import { useId, useRef, useState, type FormEvent } from "react";
import { wywolajApi } from "../api.ts";
import { PRZYKLAD_PUSTY, stanZapytania, type Stan } from "../stany.ts";
import { ZAKLADKI, brakujacePole, podpisWywolania, type Wartosci, type Zakladka } from "../playground.ts";
import { KartaMostek } from "./KartaMostek.tsx";
import { Zakladki } from "./Zakladki.tsx";

type Widok = Stan | { typ: "laduje" } | { typ: "nagrany"; dane: any };

// Plac zabaw: prawdziwe wywołania narzędzi bez modelu, zero kosztu LLM. Na starcie pokazuje nagranie, żeby panel nie był pusty.
export function Playground() {
  const id = useId();
  const [aktywna, setAktywna] = useState<Zakladka["id"]>("katalog");
  const [wartosci, setWartosci] = useState<Record<string, Wartosci>>(() => Object.fromEntries(ZAKLADKI.map((z) => [z.id, z.przyklady[0]])));
  const [widok, setWidok] = useState<Widok>({ typ: "nagrany", dane: ZAKLADKI[0].zapas });
  const [blad, setBlad] = useState<string | null>(null);
  const kolejnosc = useRef(0);

  const z = ZAKLADKI.find((x) => x.id === aktywna)!;
  const w = wartosci[aktywna];

  async function uruchom(zak: Zakladka, wart: Wartosci) {
    const brak = brakujacePole(zak, wart);
    if (brak) { setBlad(`Uzupełnij pole: ${brak.etykieta}.`); return; }
    setBlad(null);
    setWidok({ typ: "laduje" });
    const moja = ++kolejnosc.current;
    try {
      const dane = await wywolajApi(zak.narzedzie, zak.args(wart));
      if (moja === kolejnosc.current) setWidok(stanZapytania(dane, null));
    } catch (err) {
      if (moja === kolejnosc.current) setWidok(stanZapytania(null, err as Error));
    }
  }

  function wyslij(e: FormEvent) {
    e.preventDefault();
    void uruchom(z, w);
  }

  const wpisano = !brakujacePole(z, w);
  return (
    <div className="narzedzia-reczne">
      <p className="plac-opis">To prawdziwe wywołania narzędzi bez modelu AI. Tak asystent pyta o dane miasta.</p>
      <Zakladki idBazowe={id} etykieta="Narzędzia do wypróbowania" pozycje={ZAKLADKI.map((x) => ({ id: x.id, etykieta: x.etykieta }))} aktywna={aktywna} onZmiana={(i) => { setAktywna(i as Zakladka["id"]); setBlad(null); }}>
        <form onSubmit={wyslij} noValidate aria-busy={widok.typ === "laduje"}>
          <div className="plac-pola">
            {z.pola.map((p) => (
              <label key={p.klucz} className="pole">
                {p.etykieta}
                <input type="text" value={w[p.klucz] ?? ""} autoComplete="off" onChange={(e) => setWartosci((prev) => ({ ...prev, [aktywna]: { ...prev[aktywna], [p.klucz]: e.target.value } }))} />
              </label>
            ))}
            <button type="submit" className="przycisk przycisk-glowny" disabled={widok.typ === "laduje"}>{widok.typ === "laduje" ? "Szukam…" : "Sprawdź"}</button>
          </div>
          <p className="plac-przyklady">
            <span>Przykłady:</span>
            {z.przyklady.map((p) => (
              <button key={JSON.stringify(p)} type="button" onClick={() => { setWartosci((prev) => ({ ...prev, [aktywna]: p })); void uruchom(z, p); }}>
                {Object.values(p).join(" → ")}
              </button>
            ))}
          </p>
          {blad && <p className="plac-blad" role="alert">{blad}</p>}
        </form>
        {wpisano && (
          <div className="wywolanie">
            Tak model wywołuje narzędzie:
            <pre><code>{podpisWywolania(z, w)}</code></pre>
          </div>
        )}
        <div aria-live="polite">
          {widok.typ === "blad" && (
            <p className="plac-blad" role="alert">
              {widok.komunikat}{" "}
              <button type="button" className="przycisk przycisk-maly" onClick={() => setWidok({ typ: "nagrany", dane: z.zapas })}>Pokaż nagrany przykład</button>
            </p>
          )}
          {widok.typ === "pusty" && <p>Nie ma zbiorów dla tego tematu. Spróbuj: <strong>{PRZYKLAD_PUSTY}</strong>.</p>}
          {(widok.typ === "wynik" || widok.typ === "nagrany") && (
            <>
              <p className="karta-tytul">{widok.typ === "wynik" ? "Wynik na żywo" : "Przykład z nagrania. Kliknij Sprawdź, żeby wywołać narzędzie na żywo."}</p>
              <div className="karta-ramka" tabIndex={0} role="region" aria-label={z.etykieta}>
                <KartaMostek dane={widok.dane} />
              </div>
            </>
          )}
        </div>
      </Zakladki>
    </div>
  );
}
