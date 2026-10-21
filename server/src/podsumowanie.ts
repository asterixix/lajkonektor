// Krótkie podsumowanie wyniku po polsku, dla klientów bez MCP Apps (Perplexity, Gemini, Inspector) i dla modelu:
// pierwsze pole wyniku, które można przekazać użytkownikowi wprost. Czysta funkcja, bez dostępu do sieci.
const f = (n: unknown, m = 1) => (typeof n === "number" ? new Intl.NumberFormat("pl-PL", { maximumFractionDigits: m }).format(n) : "?");

export function podsumuj(nazwa: string, d: any): string {
  try {
    switch (nazwa) {
      case "odjazdy": {
        const o: any[] = d.odjazdy ?? [];
        return o.length ? `Najbliższe odjazdy (na żywo): ${o.slice(0, 5).map((x) => `linia ${x.linia} ${x.kierunek ? "→ " + x.kierunek : ""} o ${x.odjazd} (za ${x.za_min} min${x.opoznienie_s ? `, opóźnienie ${Math.round(x.opoznienie_s / 60)} min` : ""})`).join("; ")}.` : "Brak odjazdów w feedzie GTFS-RT (kursy niewyjechane mogą jeszcze nie być widoczne).";
      }
      case "trasa": {
        const o: any = d.opcje?.[0];
        if (!o) return "Nie znaleziono połączenia z maksymalnie jedną przesiadką.";
        const nogi = o.nogi.map((n: any) => `linia ${n.linia} (${n.wsiadanie} → ${n.wysiadanie}, ${n.jazda_min} min)`).join(", potem ");
        return `Najlepsza opcja (${o.rodzaj}): ok. ${o.czas_min} min. Dojście ${o.dojscie_start.min} min do przystanku ${o.dojscie_start.przystanek}, ${nogi}, dojście ${o.dojscie_cel.min} min do celu. To szacunek, nie gwarancja. Opcji łącznie: ${d.opcji}.`;
      }
      case "przystanki_w_poblizu":
        return `${d.przystanki?.length ?? 0} przystanków w pobliżu: ${(d.przystanki ?? []).slice(0, 5).map((p: any) => `${p.nazwa} (${p.dojscie_min} min pieszo, linie ${(p.linie ?? []).slice(0, 6).join(", ")})`).join("; ")}.`;
      case "utrudnienia":
        return d.liczba ? `Aktywne komunikaty ZTP: ${d.liczba}.` : "Brak aktywnych komunikatów o utrudnieniach.";
      case "status_zrodel": {
        const zle = (d.testy ?? []).filter((t: any) => t.blad || t.status >= 400);
        return zle.length ? `Nie odpowiadają: ${zle.map((t: any) => t.host).join(", ")}.` : "Wszystkie źródła odpowiadają.";
      }
      case "parki_geometria":
        return `Parków: ${d.liczba}. Pokrycie konturów OSM: ${d.pokrycie?.parki_z_geometria} z ${d.pokrycie?.parki_ogolem} parków (${d.pokrycie?.udzial_powierzchni_proc}% powierzchni).`;
      case "dane_zapytaj":
        return `Zwrócono ${d.wiersze_zwrocone} wierszy ze zbioru ${d.zbior}.${d.uwagi?.length ? " Uwagi: " + d.uwagi.join(" ") : ""}`;
      case "plik_odczyt":
        return `Plik ${d.format}: ${d.wierszy_w_pliku} wierszy, ${d.kolumny_profil?.length ?? 0} kolumn; zwrócono ${d.wiersze?.length ?? 0}.`;
      case "bdl_dane": {
        const w: any[] = d.wiersze ?? [];
        return w.length ? `Szereg GUS (${d.jednostka}): ${w.slice(-3).map((x) => `${x.rok}: ${f(x.wartosc, 2)}${x.jednostka_miary === "%" ? "%" : ""}`).join(", ")} (ostatnie wartości).` : "Brak danych dla podanych zmiennych.";
      }
      case "prognoza": {
        const p: any = d.prognoza?.[0];
        return `Projekcja metodą ${d.metoda}: ${p ? `${p.x}: ${f(p.wartosc, 2)} (przedział 95%: ${f(p.dolna_95, 2)}–${f(p.gorna_95, 2)})` : "brak"}. To projekcja trendu, nie przewidywanie.${d.ostrzezenia?.length ? " Ostrzeżenia: " + d.ostrzezenia.join(" ") : ""}`;
      }
      case "widok":
        return `Karta „${d.tytul}”: ${(d.bloki ?? []).map((b: any) => b.typ + (b.razem ? ` (${b.razem} wierszy)` : "")).join(", ")}. Źródło: ${d.zrodlo}.`;
      case "katalog_szukaj":
        return `Znaleziono ${d.liczba} zbiorów. Najlepszy: ${d.wyniki?.[0]?.id ?? "brak"}.${d.brak_pelnego_dopasowania ? " Brak pełnego dopasowania: to tylko zbiory podobne." : ""}${d.brak_w_katalogu ? " " + d.brak_w_katalogu : ""}`;
      case "adres_na_punkt":
        return d.liczba ? `Adres: ${d.kandydaci[0].ulica} ${d.kandydaci[0].numer}, ${d.kandydaci[0].kod_pocztowy}, ${d.kandydaci[0].dzielnica}; współrzędne ${d.kandydaci[0].lat?.toFixed(5)}, ${d.kandydaci[0].lon?.toFixed(5)}.` : "Nie znaleziono adresu.";
      default:
        return "";
    }
  } catch {
    return "";
  }
}
