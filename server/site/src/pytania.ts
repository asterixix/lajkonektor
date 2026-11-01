// Pula przykładowych pytań do czatu i własnego klienta AI; strona losuje kilka przy każdym wejściu.
// Każde pytanie sprawdzono 31.10.2026 wywołaniem wskazanego narzędzia na lokalnym MCP, bez modelu; pytania o apteki i biblioteki
// przeniesiono 1.11.2026 z osm_obiekty na obiekty_w_poblizu (rejestr MSIP), bo publiczne serwery Overpass nie odpowiadały.
// Pytania o niejednoznaczne miejsca są celowe: pokazują wybór lokalizacji zamiast zgadywania.
export interface PrzykladPytania { tekst: string; narzedzie: string }

export const PULA: PrzykladPytania[] = [
  { tekst: "Jakie dane o hałasie ma Kraków? Pokaż pięć zbiorów i co zawierają.", narzedzie: "katalog_szukaj" },
  { tekst: "Które dzielnice mają największą powierzchnię parków miejskich?", narzedzie: "dane_zapytaj" },
  { tekst: "Kiedy najbliższy tramwaj spod Teatru Słowackiego?", narzedzie: "odjazdy" },
  { tekst: "Jak dojechać z ulicy Basztowej 20 na Łojasiewicza 4?", narzedzie: "trasa" },
  { tekst: "Które apteki są najbliżej placu Centralnego?", narzedzie: "obiekty_w_poblizu" },
  { tekst: "Jak zmieniała się stopa bezrobocia w Krakowie i co pokazuje prognoza?", narzedzie: "prognoza" },
  { tekst: "Pokaż ranking dzielnic według liczby mieszkańców.", narzedzie: "wskaznik_dzielnic" },
  { tekst: "Jakie informacje planistyczne są dostępne dla adresu Telimeny 11?", narzedzie: "planowanie_w_punkcie" },
  { tekst: "Czy są teraz utrudnienia w komunikacji miejskiej?", narzedzie: "utrudnienia" },
  { tekst: "Która biblioteka jest najbliżej Rynku Podgórskiego?", narzedzie: "obiekty_w_poblizu" },
  { tekst: "Jakie zbiory o cenach mieszkań w Krakowie są na dane.gov.pl?", narzedzie: "dane_gov" },
  { tekst: "W których dzielnicach jest najmniej szkół podstawowych na dzieci w wieku 7-14 lat?", narzedzie: "wskaznik_dzielnic" },
  { tekst: "Które dzielnice mają najwięcej aptek na 10 tysięcy mieszkańców?", narzedzie: "wskaznik_dzielnic" },
  { tekst: "Jak zmieniała się liczba ludności Krakowa według GUS?", narzedzie: "bdl_dane" },
  { tekst: "Ile dzieci rodzi się co roku w Krakowie według GUS?", narzedzie: "bdl_dane" },
  { tekst: "Jakie dane o infrastrukturze rowerowej udostępnia miasto?", narzedzie: "katalog_szukaj" },
  { tekst: "Gdzie znajdę dane o pozwoleniach na budowę w Krakowie?", narzedzie: "katalog_szukaj" },
  { tekst: "Czy Kraków udostępnia dane o jakości powietrza? Czego w nich brakuje?", narzedzie: "katalog_szukaj" },
  { tekst: "Jakie przystanki są najbliżej ulicy Basztowej 20?", narzedzie: "przystanki_w_poblizu" },
  { tekst: "Jakie dane o instytucjach kultury ma Kraków?", narzedzie: "katalog_szukaj" },
  { tekst: "W których dzielnicach mieszkania na rynku pierwotnym są najdroższe za metr?", narzedzie: "wskaznik_dzielnic" },
  { tekst: "Przygotuj do pobrania dane o ludności dzielnic w CSV, z opisem źródła.", narzedzie: "dane_eksportuj" },
];

/** n różnych pozycji w losowej kolejności (częściowe tasowanie Fishera-Yatesa). */
export function losuj<T>(lista: readonly T[], n: number, los: () => number = Math.random): T[] {
  const k = [...lista];
  const ile = Math.min(n, k.length);
  for (let i = 0; i < ile; i++) {
    const j = i + Math.floor(los() * (k.length - i));
    [k[i], k[j]] = [k[j], k[i]];
  }
  return k.slice(0, ile);
}
