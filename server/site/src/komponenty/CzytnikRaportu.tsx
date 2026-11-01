import { useRef, useState } from "react";
import { LIMIT_RAPORTU, wczytajRaport } from "../../../shared/eksport-raportu.ts";
import type { RaportAnalityczny } from "../../../shared/raport.ts";
import { KartaMostek } from "./KartaMostek.tsx";

// File.text() działa lokalnie. Nie ma uploadu, konta ani zapisu raportu po stronie serwera.
export function CzytnikRaportu() {
  const [raport, setRaport] = useState<RaportAnalityczny | null>(null);
  const [blad, setBlad] = useState("");
  const [czyta, setCzyta] = useState(false);
  const [komentarz, setKomentarz] = useState("");
  const odczyt = useRef(0);
  const wybor = useRef<HTMLInputElement>(null);
  return <main className="czytnik-raportu" aria-labelledby="czytnik-raportu-tytul" style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(16px, 4vw, 48px)" }}>
    <p><a href="/">← Wróć do Lajkonektora</a></p>
    <h1 id="czytnik-raportu-tytul">Otwórz zapisany raport</h1>
    <p>Wybierz plik JSON z pakietu raportu Lajkonektora. Plik jest odczytywany wyłącznie w Twojej przeglądarce i nie jest wysyłany na serwer. Nie potrzebujesz konta. Raport nie jest zapisywany na serwerze; zachowaj własną kopię.</p>
    <label htmlFor="czytnik-raportu-plik">Plik raportu JSON (maks. 8 MiB)</label>{" "}
    <input ref={wybor} id="czytnik-raportu-plik" type="file" accept=".json,application/json" onChange={async (e) => {
      const plik = e.currentTarget.files?.[0], nr = ++odczyt.current;
      setBlad(""); setRaport(null);
      if (!plik) { setCzyta(false); return; }
      setCzyta(true);
      try {
        if (plik.size > LIMIT_RAPORTU) throw new Error("Plik przekracza dopuszczalny rozmiar 8 MiB.");
        const wynik = wczytajRaport(await plik.text());
        if (nr === odczyt.current) { setRaport(wynik); setKomentarz(wynik.wnioski.join("\n")); }
      } catch (e) { if (nr === odczyt.current) setBlad(e instanceof Error ? e.message : "Nie udało się odczytać pliku."); }
      finally { if (nr === odczyt.current) setCzyta(false); }
    }} />
    <p role="status" aria-live="polite">{czyta ? "Odczytywanie pliku…" : raport ? "Raport otwarto lokalnie." : ""}</p>
    {blad && <p role="alert">{blad}</p>}
    {raport && <><button type="button" onClick={() => { setRaport(null); if (wybor.current) wybor.current.value = ""; }}>Zamknij raport</button>
      <details><summary>Dołącz własną interpretację do lokalnej kopii</summary>
        <p>Wnioski i rekomendacje wymagają oceny człowieka. Wpisy są komentarzem, nie wynikiem obliczeń. Zmiana komentarza nie zmienia tabel, źródeł ani planu.</p>
        <label htmlFor="komentarz-raportu">Interpretacja i warianty działań (każdy akapit w osobnym wierszu)</label>
        <textarea id="komentarz-raportu" rows={5} maxLength={6000} value={komentarz} onChange={(e) => setKomentarz(e.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", font: "inherit" }} />
        <button type="button" onClick={() => setRaport({ ...raport, wnioski: komentarz.split("\n").map((s) => s.trim()).filter(Boolean) })}>Dołącz komentarz do kopii i eksportu</button>
      </details><KartaMostek dane={{ _widok: "zlozony", raport }} /></>}
  </main>;
}
