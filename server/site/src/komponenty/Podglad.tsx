import { useEffect, useState } from "react";
import { DownloadSimple, Copy } from "@phosphor-icons/react";
import { argumentyPodgladu, odczytajPodglad, type Podglad as P } from "../../../shared/podglad.ts";
import { nazwaPakietuDanych, pakietDanychZIP } from "../../../shared/eksport-danych.ts";
import { nazwaPliku, tabelaCSV } from "../../../shared/eksport-raportu.ts";
import { wywolajApi } from "../api.ts";
import { pobierzPlik } from "../karta.ts";
import { KartaMostek } from "./KartaMostek.tsx";

// Tymczasowa podstrona otwierana z karty: pełny widok zbioru i eksport do własnej analizy.
// Dane pobierane są ponownie w tej przeglądarce; serwer niczego nie zapisuje.
export function Podglad() {
  const [p] = useState<P | null>(() => odczytajPodglad(window.location.hash));
  const [opis, setOpis] = useState<any>(null);
  const [wynik, setWynik] = useState<any>(null);
  const [blad, setBlad] = useState("");
  const [status, setStatus] = useState("");
  const [pobrano] = useState(() => new Date());

  useEffect(() => {
    if (!p) return;
    const { nazwa, argumenty } = argumentyPodgladu(p);
    void wywolajApi("zbior_opis", { id: p.id }).then(setOpis).catch((e) => setBlad(e.message));
    if (nazwa !== "zbior_opis") void wywolajApi(nazwa, argumenty).then(setWynik).catch((e) => setBlad(e.message));
  }, [p]);

  if (!p) return <main className="podglad"><p><a href="/">Wróć do Lajkonektora</a></p><h1>Nie rozpoznano zbioru</h1><p>Otwórz podgląd ponownie przyciskiem na karcie.</p></main>;

  const tytul = String(opis?.tytul ?? p.id).split(" / ").pop();
  const gis = opis?.zrodlo === "msip" && opis?.geometria && opis?.url;
  const karta = p.widok === "opis" ? opis : wynik;

  const pobierzDane = async (format: "zip" | "json") => {
    setStatus("Pobieram wszystkie strony zbioru…");
    try {
      const r = await wywolajApi("dane_eksportuj", { z: { narzedzie: "dane_zapytaj", argumenty: { id: p.id } }, tytul });
      const pakiet = r.pakiet_danych;
      if (format === "zip") pobierzPlik(nazwaPakietuDanych(pakiet), "application/zip", pakietDanychZIP(pakiet));
      else pobierzPlik(nazwaPakietuDanych(pakiet).replace(/\.zip$/, ".json"), "application/json", JSON.stringify(pakiet, null, 2));
      setStatus(`Gotowe: ${pakiet.tabele.reduce((n: number, t: any) => n + t.wiersze.length, 0)} wierszy.`);
    } catch (e) { setStatus(e instanceof Error ? e.message : "Nie udało się przygotować danych."); }
  };
  const pobierzPola = () => {
    const wiersze = (opis.pola as string[]).map((x) => { const [pole, typ] = x.split(":"); return { pole, typ: typ ?? "", alias: opis.aliasy?.[pole] ?? "" }; });
    pobierzPlik(`${nazwaPliku(tytul ?? "zbior")}-pola.csv`, "text/csv;charset=utf-8", tabelaCSV({ id: "pola", tytul: "Pola", kolumny: ["pole", "typ", "alias"], wiersze, zrodla: [], uwagi: [] }));
  };
  const kopiuj = async () => { try { await navigator.clipboard.writeText(opis.url); setStatus("Skopiowano adres usługi."); } catch { setStatus("Zaznacz adres i skopiuj go ręcznie."); } };

  return (
    <main className="podglad" aria-labelledby="podglad-tytul">
      <p><a href="/">Wróć do Lajkonektora</a></p>
      <h1 id="podglad-tytul">{tytul}</h1>
      <p className="lead">Tymczasowy podgląd zbioru <code>{p.id}</code>. Dane pobrano ponownie ze źródła {pobrano.toLocaleString("pl-PL")}. Strona niczego nie zapisuje; zamknięcie karty usuwa podgląd.</p>
      {blad && <p role="alert">{blad}</p>}
      <div className="podglad-siatka">
        <section aria-label="Widok zbioru">{karta ? <KartaMostek dane={karta} /> : !blad && <p role="status">Pobieram dane…</p>}</section>
        <aside className="podglad-eksport" aria-labelledby="eksport-tytul">
          <h2 id="eksport-tytul">Pobierz do własnej analizy</h2>
          {gis && <>
            <h3>Mapa do GIS</h3>
            <p><a className="przycisk przycisk-glowny" href={`/api/geojson?id=${encodeURIComponent(p.id)}`} download><DownloadSimple size={18} weight="bold" aria-hidden="true" /> GeoJSON, pełna geometria</a></p>
            <p className="zrodlo">Wszystkie obiekty warstwy, geometria źródła bez uproszczeń, WGS84 (EPSG:4326). Otwiera się w ArcGIS Pro (JSON To Features), ArcGIS Online i QGIS.</p>
            <p>Usługa ArcGIS REST, zawsze aktualna:</p>
            <div className="podl-adres"><code>{opis.url}</code><button type="button" className="przycisk" onClick={kopiuj}><Copy size={18} weight="bold" aria-hidden="true" /> Kopiuj</button></div>
            <p className="zrodlo">ArcGIS Pro: Mapa, Dodaj dane, Dane ze ścieżki, wklej adres. QGIS: Warstwa, Dodaj warstwę, ArcGIS REST Server.</p>
          </>}
          <h3>Dane tabelaryczne</h3>
          <p><button type="button" className="przycisk przycisk-glowny" onClick={() => void pobierzDane("zip")}><DownloadSimple size={18} weight="bold" aria-hidden="true" /> CSV i JSON z pochodzeniem (ZIP)</button></p>
          <p><button type="button" className="przycisk" onClick={() => void pobierzDane("json")}>Tylko JSON</button></p>
          <p className="zrodlo">Wszystkie strony zbioru, do 5000 wierszy; większy zbiór zostanie odrzucony, a nie ucięty.{gis ? " Atrybuty bez geometrii; mapę pobierz jako GeoJSON." : ""}</p>
          {opis?.pola?.length > 0 && <><h3>Opis pól</h3><p><button type="button" className="przycisk" onClick={pobierzPola}>Opis pól (CSV)</button></p></>}
          <p role="status" aria-live="polite">{status}</p>
        </aside>
      </div>
      {p.widok !== "opis" && opis && <details className="reszta"><summary>Opis pól zbioru</summary><KartaMostek dane={opis} /></details>}
    </main>
  );
}
