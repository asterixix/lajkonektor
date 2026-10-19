# System graficzny Lajkonektora

**Data:** 2026-10-19 · **Stan:** projekt gotowy, niezaimplementowany · **Pewność:** wysoka dla tokenów i danych, niska dla renderowania w Claude Pro (nie sprawdzone).

Plansza w Claude (prywatna): https://claude.ai/artifact/JkmB2MLnNRsgpxuEtUgLCb . Kopie źródeł leżą w repo, więc plansza nie jest jedynym miejscem prawdy.

## Gdzie co leży

| Co | Gdzie |
|---|---|
| Logo (pełny kolor 768 px, 128 px, sylwetka biała) | `brand/znak.png`, `brand/znak-128.png`, `brand/znak-sylwetka.png` |
| Tokeny CSS | `brand/tokens.css` (zmienne `--lk-*`) |
| Mapy parków z prawdziwych konturów | `brand/mapa-parki-biala.svg`, `-zielona.svg`, `-park-jordana.svg` |
| Generator map | `brand/build-mapa.py` (czyta `server/data/parki-osm.json`; uruchom z `brand/`) |
| Layouty (źródła artboardów) | `docs/05-design/layouty/*.dc.html` + `canvas.json` |

Layouty to źródła z planszy Claude: HTML w znaczniku `<x-dc>` plus mały skrypt `DCLogic` (stan, np. przełączniki). Do uruchomienia poza planszą potrzebują `support.js` (runtime planszy, którego nie ma w repo), więc traktuj je jako **wzorzec do przepisania**: markup i style inline są zwykłym HTML, dziury `{{...}}` i `<sc-if>`/`<sc-for>` trzeba zamienić na własny szablon. Ścieżki obrazów wskazują na `brand/`.

## Skąd decyzje

- **SIW Miasta Krakowa 2023** (`SIW_2023.pdf`, s. 20-24, 19): kolory Pantone 2945 C / 294 C / 116 C / 465 C, kroje Ubuntu Medium (logo i znaki) i Lato (teksty). Serwisy miejskie mają być oparte o projekt krakow.pl (zarządzenie 1447/2019).
- **krakow.pl** (CSS `index.*.css`): tekst #071F32, tło #F5F5F5, linie #BFBFBF, błąd #AF1828, kafle bez zaokrągleń (`border-radius:0`), nazwy Lato Bold/Black, niebieska belka tytułowa.
- Znak i serwis **nie** są znakiem Miasta. Herb wymaga zgody Miasta (SIW 1.2), nie używamy go. Stopka strony mówi: projekt niezależny.

## Logo

Źródło: `Lajkonektor icon.svg` od zespołu (Lajkonik na koniku, pierścień połączonych węzłów, sylwetka miasta u dołu). To **bitmapa 1264 px w kopercie SVG** z maską, z metadanymi C2PA (Canva AI). Wycięte do przezroczystego PNG.

- Na jasnym tle: pełny kolor. Na ciemnym niebieskim (#0063AF, #00488E): **zawsze na białym kwadracie**, bo granatowe kontury giną.
- Poniżej 32 px (favicon, karta przeglądarki): `znak-sylwetka.png` w jednym kolorze.
- Wordmark: „Lajkonektor", Ubuntu Medium, niebieski #0063AF (biały na ciemnym).
- Ryzyka: bitmapa (do druku i plakatu potrzebny wektor), pochodzenie AI (sprawdź regulamin konkursu), wordmark jako tekst (do druku zamienić na krzywe).

## Tokeny (`brand/tokens.css`)

| Zmienna | Hex | Rola |
|---|---|---|
| `--lk-niebieski` | #0063AF | belka, linie, przyciski główne |
| `--lk-niebieski-ciemny` | #00488E | duże ciemne pola (sekcja luk, panel marki) |
| `--lk-zolty` | #FFCC00 | **tylko** główne wezwanie do działania i zaznaczony obiekt |
| `--lk-zloty` | #CDB794 | akcent w stopce, beż znaku |
| `--lk-atrament` | #071F32 | tekst, aktywny przełącznik |
| `--lk-szary-tlo` | #F5F5F5 | tła pomocnicze, stopki kart |
| `--lk-szary-linia` | #BFBFBF | obramowania |
| `--lk-szary-tekst` | #505050 | tekst pomocniczy (7:1 na #F5F5F5) |
| `--lk-czerwony` | #AF1828 | błąd, opóźnienie, utrudnienia |
| `--lk-zielony` | #2E7D32 | na żywo, o czasie, parki |

Kroje: `--lk-font` Lato (900 nagłówki i liczby, 700 etykiety, 400 treść), `--lk-font-znak` Ubuntu 500 (tylko logotyp). Nazwy narzędzi i adresy: monospace systemowy.

## Komponenty

- **Ramka karty MCP:** nagłówek (białe kwadratowe pole z `znak-128.png` 44 px, eyebrow = id narzędzia małymi literami wersalikami, tytuł 22 px/900 o jednym obiekcie, znacznik po prawej), treść, stopka #F5F5F5 z „Źródło: ... stan/data ... pokrycie". Szerokość 520 px (listy) lub 640 px (mapy, wykresy).
- **Numer linii:** kwadratowa plakietka #0063AF, biała liczba 900. Ten sam motyw na stronie to „numer narzędzia" w tabeli.
- **Znaczniki:** `NA ŻYWO` (zielony), `MIGAWKA dd.mm.rrrr` (atrament), `Pokrycie 47 z 78` (obrys niebieski), `BŁĄD` (czerwony).
- **Przyciski:** główny żółty (jeden na ekran), pomocniczy niebieski, drugorzędny obrys 2 px. Min. wysokość 40 px, ruch 2 px w dół po naciśnięciu.
- **Komunikat o utrudnieniu:** pas z czerwoną etykietą `LINIA 8` i tekstem (bez kolorowej krawędzi z boku).
- **Stany (obowiązkowe dla każdej karty):** ładowanie (szkielet, `role="status"`, pulsowanie wyłączone przy `prefers-reduced-motion`), błąd (kod w monospace, co się stało, co dalej, dwa przyciski), pusto (dlaczego i co zrobić; „brak w feedzie" ≠ „linia nie kursuje").

## Karty MCP Apps: mapowanie na narzędzia

Wszystkie narzędzia już zwracają `structuredContent` (`server.ts`, funkcja `run`), więc karta czyta pola wprost. Zawsze zostaje tekstowy `content` jako zapas.

| Plik | Narzędzie | Pola wyniku → UI |
|---|---|---|
| `Odjazdy` 520×600 | `odjazdy` | `odjazdy[]`: `linia`→plakietka, `kierunek`, `odjazd` (hh:mm), `za_min`→duża liczba, `opoznienie_s`→„opóźnienie N min"/„o czasie"; `komunikaty`→pas utrudnień; `czas_feedu`→„stan hh:mm"; `zrodlo` w stopce |
| `Trasa` 520×600 | `trasa` | `Opcja`: `czas_min` (duży), `rodzaj` (zakładki), `dojscie_start`, `nogi[]` (`linia`, `kierunek`, `wsiadanie`, `wysiadanie`, `przystankow`, `jazda_min`), `przesiadka`, `czekanie_min`, `dojscie_cel`, `zrodlo_czasu` |
| `Przystanki` 520×600 | `przystanki_w_poblizu` | `przystanki[]` z `dojscie_min`, odległością, liniami; `zrodlo_dojscia` w stopce; pasek skali do 1500 m |
| `Parki` 640×700 | `parki_geometria` | `parki[]`: `powierzchnia_od_ha` vs `osm.powierzchnia_osm_ha`, `zgodnosc`; `pokrycie` (47/78, 46,9%) w stopce; mapa z konturami |
| `Tabela` 640×640 | `dane_zapytaj` | `wiersze[]` z `grupuj_po`/`agreguj`; przełącznik Tabela/Słupki; stopka mówi, co pominięto |
| `Szereg` 640×640 | `bdl_dane` | `wiersze[]` `{rok, wartosc, jednostka_miary}`; duża ostatnia wartość, zmiana, wykres liniowy, min/max |
| `Status` 520×440 | `status_zrodel` | `testy[]` `{host, status, ms, blad}`; `worker.colo/kraj`; `uwaga` w stopce |
| `Stany` | wszystkie | szkielet, błąd (np. 522), pusto |

**Uwaga implementacyjna:** `parki_geometria` zwraca dziś tylko `srodek` i `bbox`, **bez pierścieni konturu**. Karta z mapą wymaga albo dodania uproszczonych konturów do wyniku, albo osadzenia migawki w zasobie `ui://`. Poza tym piksele etykiet na mapie (`build-mapa.py` drukuje środki) są ustawione ręcznie dla Parku Jordana; przy innym parku trzeba je liczyć z danych.

Bez karty zostają: `katalog_szukaj`, `zbior_opis`, `bdl_szukaj`, `dane_gov`, `adres_na_punkt`, `utrudnienia` (jest w karcie odjazdów), `prognoza`, `plik_odczyt`.

## Strona demo (`Demo`, fluidalna, bez szablonu)

Kolejność: nagłówek → hero z działającym demo → **Rozkład narzędzi** (tabela) → **Czego nie wiemy** (pełna szerokość, mapa konturów) → **Podłączenie** → stopka. Nie ma cenników, FAQ ani siatki ikon.

- **Hero:** H1 „Model pyta. Kod liczy. Kraków podaje źródło.", jedno żółte wezwanie „Dodaj do Claude". Trzy pytania do kliknięcia przełączają pytanie, wywołanie narzędzia w monospace, odpowiedź i kartę. Karty parków to prawdziwe dane, karta odjazdów to przykład (podpisany).
- **Rozkład narzędzi:** belka #0063AF, wiersze: numer, nazwa narzędzia, co robi, skąd i jak świeże. 8 z 15 narzędzi.
- **Czego nie wiemy:** „Na mapie jest 47 z 78 parków." Powód: 23 nie znaleziono po nazwie, 8 bez domkniętego obrysu; 46,9% powierzchni. Atrybucja OSM (ODbL) pod mapą.
- **Podłączenie:** trzy kroki w numerowanych plakietkach, adres `https://lajkonektor.sendyka.workers.dev/mcp` z przyciskiem kopiowania (etykieta zmienia się na „Skopiowano" tylko po udanym zapisie do schowka).
- Hasło z `PROGRESS.md` „Podłącz Kraków" nie weszło do H1; pasuje na przycisk lub podtytuł, jeśli zespół woli.

## Zasady, które da się sprawdzić

1. Kolory tylko ze zmiennych `--lk-*`; brak indygo, gradientów, rozmytych plam.
2. Żółty najwyżej dwa razy na ekran.
3. Każda liczba ma źródło i datę; wartość przykładowa jest podpisana jako przykład; brak danych to pole `pokrycie`, nie wymyślona liczba.
4. Brak emoji; ikony kreską 2 px; ilustracje i mapy z prawdziwych danych.
5. Kafle kwadratowe, bez zaokrągleń i bez kolorowej krawędzi z boku.
6. Każda karta ma stany: ładowanie, błąd, pusto.
7. Język miasta: „Odśwież", „Sprawdź status źródeł"; nie „Get started".
8. Kontrast 4,5:1, przyciski min. 40 px, stan nie tylko kolorem.
9. Wymienne znaczniki sekcji (belka, plakietka) zamiast dekoracji.

## Prawdziwe czy przykładowe

- **Prawdziwe:** parki (`parki-osm.json`, migawka 19.10.2026), sumy po dzielnicach, pokrycie 47/78 i 46,9%, szereg GUS BDL (zmienna 461691, powiat m. Kraków, grudzień 2011-2025), lista narzędzi i adres konektora.
- **Przykładowe (podpisane w stopkach):** odjazdy, trasa, przystanki, status źródeł (w tym 522 dla ZTP).

## Znane problemy i niesprawdzone

- **Błąd danych:** „Planty Bieńczyckie" i „Planty Krakowskie" mają ten sam kontur OSM (21,45 ha). Do naprawy w `server/scripts/build-parki-osm.mjs`.
- **Niesprawdzone:** renderowanie MCP Apps w Claude Pro; czcionki z Google Fonts w piaskownicy iframe MCP Apps (może blokować zewnętrzne zasoby: wtedy Lato trzeba osadzić albo zostawić `system-ui`); obrazy i mapy trzeba osadzić inline; przycisk kopiowania w iframe; układ na telefonie (zaprojektowany, nie obejrzany); tryb ciemny (nie zaprojektowany).
- **Do decyzji:** wektor logo; właściciel domeny lajkonektor.pl i znak UPRP/EUIPO (z `PROGRESS.md`).
