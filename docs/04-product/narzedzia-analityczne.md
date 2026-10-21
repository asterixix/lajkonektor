# Narzędzia analityczne, wizualizacyjne i planistyczne: research i decyzje

**Data:** 2026-10-22 · **Pewność:** wysoka dla źródeł prawnych, danych miasta i działania narzędzi (testy offline, wywołania na żywo); średnia dla oceny „co jest najbardziej potrzebne”, bo nie sprawdzono tego na użytkownikach (Customer Discovery nadal otwarte). Wyszukiwarki z dostępem do sieci: Exa (Tavily wyczerpał limit), więc część prac źródłowych oparta na streszczeniach stron.

## 1. Co robią podobne serwery MCP (prior art)
| Serwer | Narzędzia istotne dla nas | Wniosek |
|---|---|---|
| World Bank Data360 MCP | `summarize_data`, `rank_countries`, `compare_countries`, `get_viz_spec` (Vega-Lite), zasoby z promptem systemowym i kodami | Wzorzec „rank / compare / summarize / wizualizacja” jako osobne, wąskie narzędzia; metadane i kody jako zasoby |
| CKAN MCP (ondata) | `ckan_analyze_datasets`, `ckan_catalog_stats`, `ckan_datastore_search_sql` | Analiza samego katalogu (statystyki portalu, jakość) jest osobną wartością: nasz `katalog_szukaj` ma już `brak_w_katalogu` |
| Autario, socioeconomic-data-mcp | liczby liczone po stronie serwera, proweniencja przy każdej wartości, `null` zamiast zgadywania | Zasada „model nie wymyśla liczb”: wszystkie nowe narzędzia liczą deterministycznie i podają źródło oraz stan danych |
| OSM MCP (proximap, analyze_neighborhood, isochrone, route_matrix) | `walkability_score`, `detect_amenity_gaps`, `compare_locations`, `reachable_amenities`, `plan_errands` | Kompozycja zamiast surowych danych: wynik rankingowy, „czego brakuje”, pewność przy każdej ocenie. Nasz odpowiednik na danych urzędowych: `dostepnosc`, `obiekty_w_poblizu` |
| ext-apps (budget-allocator, scatter, heatmap, scenario-modeler, map) | suwaki liczące na serwerze, scatter z legendą, heatmapa, mapa | Interaktywność (suwaki, przełączniki) zrobiona w kartach: tabela/mapa/słupki, wybór nogi trasy; scatter i choropleta dodane teraz |

**Ograniczenie z literatury MCP:** model wybiera narzędzie trafniej z ok. 6 niż z 11 (ni-c/osm-mcp). Mamy teraz 22 narzędzia publiczne, więc nowe narzędzia są **szerokie i kompozytowe** (jedno wywołanie, pełna karta), a opisy rozróżniają zakres. Do rozważenia, jeśli testy w Claude pokażą mylenie narzędzi: tryb „essential” (podzbiór) lub połączenie bliskich narzędzi.

## 2. Co jest potrzebne w Polsce: ustawa i badania
- **Art. 13f ustawy o planowaniu i zagospodarowaniu przestrzennym:** gminne standardy dostępności infrastruktury społecznej. Ustawowo: szkoła podstawowa w odległości dojścia ≤ 1500 m (miasto), zieleń publiczna ≥ 3 ha ≤ 1500 m i ≥ 20 ha ≤ 3000 m; gmina może zmienić progi i dodać przedszkole, żłobek, POZ, bibliotekę, dom kultury, DPS, sport, przystanek, pocztę, aptekę, policję. Standard decyduje o możliwości mieszkaniowych planów miejscowych i WZ.
- **Kraków ma własne standardy w projekcie planu ogólnego** (warstwa „Obszar standardów dostępności infrastruktury społecznej”, MSIP, import 20.10.2026): Obszar Intensywny 1000 m (szkoła), 500 m (zieleń ≥ 3 ha), 2000 m (zieleń ≥ 15 ha); Obszar Ekstensywny 2500 / 500 / 3000 m. To jest dane, których nikt jeszcze nie ułożył w narzędzie dla GenAI, a odpowiadają wprost na tezę bohatera (parki, MPZP) i na potrzeby urzędników.
- **15-minutowe miasto w Krakowie** (Noworól i in., Sustainability 2022): 66% mieszkańców spełnia minimum, 19% wersję optymalną; deficyt: ok. 36 tys. osób; autorzy zastrzegają, że model nie uwzględnia sieci pieszej i barier (rzeka, kolej). Nowsza diagnoza standardów w Krakowie: Wierzbicki, Kukulska-Kozieł, Hernik, Land Use Policy 2026.
- **Prognozy demograficzne:** Kraków ma zamówioną prognozę hybrydową do 2050 według 18 dzielnic (Pardysz, ACK Cyfronet, 2022) oraz dla 25 gmin MOF (2023) z dashboardami ArcGIS; GUS ma oficjalną prognozę dla powiatów i gmin 2023–2060 z trzema scenariuszami. Prognozy sprzed dekady (GUS 2014) chybiły (758 tys. vs 802 tys. w 2023), więc komunikujemy niepewność.
- **Portale miejskie** (Warszawa w liczbach, Gdańsk w liczbach): karty wskaźników z jednym przeglądem (liczba mieszkańców, uczniowie, wydatki na mieszkańca, mieszkania oddane). Przegląd literatury (Pluto-Kossakowska 2022): dobre dashboardy porównują wskaźniki między obszarami i oferują prosty oraz złożony model.

## 3. Luki w naszym zestawie (przed zmianą) → decyzje
| Potrzeba | Kto pyta | Było | Teraz |
|---|---|---|---|
| „Jak wypada dzielnica X na tle innych?” (ranking, mapa) | urzędnik, badacz, dziennikarz | model sam składał 18 zapytań | **`wskaznik_dzielnic`**: ranking, miejsce, Gini, mapa koropletowa, wykres; wskaźniki: ludność wg wieku, parki, żłobki, przedszkola, szkoły, apteki, biblioteki, cena m² |
| Dashboard dzielnicy/miasta | urzędnik, mieszkaniec | brak | **profil dzielnicy** (ten sam tool bez licznika): 8 wskaźników na tle miasta i z miejscem z 18 |
| „Czy mieszkańcy mają dostęp do X?”, „gdzie brakuje?” | planista, radny | pojedyncze zapytania przestrzenne | **`dostepnosc`**: pokrycie ludności (siatka 100 m) w zasięgu usługi + białe plamy, wg dzielnic |
| „Czy ten adres spełnia standardy planu ogólnego?” | planista, deweloper, mieszkaniec | brak | **`dostepnosc`** z `miejsce` (szkoła, zieleń 3 i 15 ha, progi z obszaru); tryb miejski: **91% mieszkańców spełnia wszystkie trzy** (szkoła 93,5%, zieleń ≥3 ha 97,5%) |
| „Co wolno zbudować / co obowiązuje na tej działce?” | mieszkaniec, inwestor, badacz | 6 ręcznych zapytań | **`planowanie_w_punkcie`**: miejscowy plan, strefa planu ogólnego z parametrami (intensywność, wysokość, udział zabudowy, biologicznie czynna), działka, UNESCO, rewitalizacja, uchwała krajobrazowa |
| „Gdzie najbliższa apteka całodobowa / toaleta / pitnik?” | mieszkaniec, turysta | `dane_zapytaj` bez sortowania po odległości | **`obiekty_w_poblizu`** (17 rodzajów) z mapą i szacunkiem czasu |
| Korelacje, trendy, nierówności, odstające | badacz | model liczył w pamięci | **`statystyka`**: opis, korelacja (Pearson, Spearman, p), trend (Mann-Kendall, Sen), wzrost (CAGR), Gini/Lorenz, klasy (Jenks), odstające; dane wprost albo przez `z` |
| Wizualizacje: choropleta, scatter, legenda | wszyscy | mapa punktów i konturów, słupki, linia | choropleta z legendą, wykres punktowy z prostą regresji, histogram (słupki) w karcie `zlozony` |

## 4. Dane i metoda
- Migawki (`data/*.json`, budowane `scripts/build-analityka.mjs` w kilka sekund z MSIP): 18 dzielnic (granice uproszczone do 15 m), ludność dzielnic wg 10 grup wieku, szereg miesięczny 72 stany, siatka Hex 100 m (6154 sześciokątów, 705 756 zameldowanych na pobyt stały, stan 2026-09-30) z typem strefy standardów oraz odległościami do szkoły podstawowej i zieleni (strefy SN i SO planu ogólnego, 541 obszarów ≥ 3 ha, 159 ≥ 15 ha).
- Odległości: linia prosta × 1,3 jako przybliżenie drogi dojścia; ustawa liczy drogę po trasie pieszej, więc wyniki to oszacowanie (podane w karcie). Zieleń publiczna = strefy planu ogólnego, nie rejestr parków (OSM pokrywa 46 z 78 parków).
- Błąd naprawiony przy okazji: uproszczenie `uprosc` nic nie robiło dla pierścieni zamkniętych (Douglas-Peucker na pętli); teraz dzieli pętlę w najdalszym wierzchołku (granice dzielnic 461 KB → 39 KB).

## 5. Czego nie robimy jeszcze (backlog z priorytetem)
1. **P1 Popyt na miejsca w przedszkolach i szkołach:** przesunięcie kohort z szeregu miesięcznego (0–2 → 3–6 → 7–14) per dzielnica plus scenariusze migracji; osobne od `prognoza` (trend szeregu). Dane są w `ludnosc-dzielnic.json`.
2. **P1 Interaktywna prognoza:** suwaki metody i horyzontu w karcie `prognoza` wołające to samo narzędzie.
3. **P1 Ekspozycja na hałas:** ilu mieszkańców w izofonach > 55/65 dB (hałas z warstw `Mapy_Halasu` × siatka Hex) i na ryzyko powodziowe.
4. **P2 Czas dojścia po sieci** (OSRM) zamiast ×1,3 dla `dostepnosc`; izochrony transportem publicznym z GTFS.
5. **P2 Plan optymalizacji lokalizacji** (gdzie postawić nową placówkę: max pokrycie, zachłannie na siatce 100 m).
6. **P2 Standardy rozszerzone** o przedszkole, żłobek, POZ, bibliotekę, aptekę, przystanek, jeśli Kraków je ustali w planie ogólnym (dziś tylko szkoła i zieleń).
7. **P3 Zasoby MCP** (kody dzielnic, słownik wskaźników) i prompty jako skróty dla klientów.

## 6. Ryzyka
- 🟡 Ludność = zameldowani na pobyt stały: w centrum (studenci, najem) liczby na mieszkańca są zawyżone; każdy wynik niesie to ostrzeżenie.
- 🟡 Projekt planu ogólnego może się zmienić do uchwalenia; `planowanie_w_punkcie` oznacza dane jako informacyjne, nie wypis.
- 🟡 Wzrost liczby narzędzi (22 publiczne) może pogorszyć trafność wyboru przez model; do sprawdzenia w Claude i ChatGPT.
- 🟡 Wartość p korelacji dzielnic jest zawyżona (sąsiedztwo przestrzenne łamie niezależność); komunikat o tym jest w karcie.
