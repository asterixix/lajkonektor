# Uniwersalny zestaw narzędzi (zastępuje listę narzędzi „pod pytanie")

**Data:** 2026-10-19 · **Faza:** 6 (Produkt) · **Pewność:** wysoka dla zaimplementowanych elementów (17 testów na żywych API, test end-to-end przez MCP na `wrangler dev`), niska dla elementów „do zrobienia".

## Decyzja
Nie budujemy osobnego narzędzia na każde pytanie (np. `park_dostepnosc`). Budujemy **mały zestaw klocków**, z których model składa dowolną analizę, oraz **katalog** (1 203 zbiory), dzięki któremu wie, gdzie szukać. Pytanie „ile osób mieszka w zasięgu parków" nie wymaga nowego kodu, tylko złożenia: katalog → opis zbioru → zapytanie ze złączeniem przestrzennym.

Powód: pytań o miasto jest nieskończenie wiele, a źródeł jest kilka typów o jednolitym API. Jury ocenia „użycie danych" (20%) i „architekturę/skalowalność" (15%), a wymaganiem użytkownika jest gotowość na wszystkie zapytania.

## Klocki (stan)

| Narzędzie | Rola | Stan |
|---|---|---|
| `katalog_szukaj` | Znajdź zbiór po temacie (potoczne słowa, stemming, diakrytyki) wśród 130 tabel OD i 1 073 warstw MSIP | ✅ |
| `zbior_opis` | Pola, aliasy, słowniki kodów, liczba rekordów, próbka, wskazówki zapytań | ✅ |
| `dane_zapytaj` | Filtr, pola, sortowanie, **agregacje z grupowaniem**, stronicowanie, **filtr przestrzenny**: punkt+promień, ramka, albo bufor wokół obiektów innej warstwy (`geometria.z`); środek i ramka obiektu | ✅ |
| `adres_na_punkt` | Geokodowanie adresu (odporne na brak polskich liter) | ✅ |
| `bdl_szukaj`, `bdl_dane` | GUS BDL: bezrobocie, ludność, wynagrodzenia itd. dla Krakowa, jako szereg czasowy | ✅ |
| `dane_gov` | Wyszukiwanie zbiorów i plików w dane.gov.pl | ✅ |
| `parki_geometria` | Geometria parków z OSM (jako „obszar" `lokalne:parki_osm` w `dane_zapytaj`); pokrycie 47/78 | ✅ (częściowe) |
| `przystanki_w_poblizu`, `odjazdy`, `trasa`, `utrudnienia` | Transport: GTFS ZTP pobierany na żywo, GTFS-RT, dojście przez OSM, komunikaty (patrz `transport.md`) | ✅ |
| `plik_odczyt` | CSV/XLSX/GeoJSON/JSON z adresu gov.pl/krakow.pl: tabela, profil kolumn, agregacja (patrz `prognoza-i-pliki.md`) | ✅ (PDF, SHP: nie) |
| `prognoza` | Deterministyczna projekcja szeregu: OLS, wykładniczy, Holt, backtest, przedziały 80/95%, ostrzeżenia | ✅ |
| MCP Apps (mapa, wykres), Skills „Badacz miejski", Tasks | Warstwa prezentacji i metodyki | ⏳ |

Usunięte jako zbędne: `parki_lista`, `mpzp_w_punkcie`, `ludnosc_w_promieniu` (robi je `dane_zapytaj`).

## Jak to składa pytania (sprawdzone na żywo)
- **Plan dla adresu** (Telimeny 11): `adres_na_punkt` → `katalog_szukaj("plan zagospodarowania")` → `dane_zapytaj` z punktem na warstwach MPZP, Studium K1 i Projekt planu ogólnego. Wynik dla Telimeny 11: **brak obowiązującego MPZP w punkcie**, Studium K1 trafia, a „Obszar standardów dostępności infrastruktury społecznej" zwraca strefę „Obszar Intensywny" (progi odległości do szkoły 1000 m itd.). Czyli odpowiedź jest, ale wymaga trzech warstw, nie jednej (dobry argument za uniwersalnością).
- **Bezrobocie**: `bdl_szukaj("stopa bezrobocia")` → `bdl_dane` (powiat m. Kraków, np. zmienna 60270: 2019: 2,0%, 2020: 3,1%, 2021: 2,8%, 2022: 2,3%, 2023: 1,9%, 2024: 2,0%, 2025: 2,5%) + tabele OD `bezrobotni`, `oferty-pracy`, `naplyw-odplyw`.
- **Cudzoziemcy**: rodzina tabel OD per rok (`…pobyt-czasowy-31-12-2023/2024/2025`); szereg = zapytania do każdej tabeli i agregacja po roku. Prognoza 2026–2036 wymaga `prognoza` (⏳).
- **Mieszkańcy w zasięgu parków**: `dane_zapytaj` na Hex100 z `geometria.z = lokalne:parki_osm, bufor_m` plus drugie zapytanie bez geometrii (całe miasto), udział liczy model z dwóch liczb serwera. Pokrycie parków 47/78 wymusza sformułowanie „co najmniej".

## Zasady jakości (wbudowane)
- Każda odpowiedź niesie `zrodlo`, a gdy trzeba `uwagi` (przycięcie, brak stronicowania, pokrycie).
- Liczy serwer (agregacje, sumy, odległości), model tylko opisuje.
- Odpowiedzi przycinane do ~60 tys. znaków, by nie zalać kontekstu; wskazówka jak zawęzić.
- Warstwy z błędnym stronicowaniem ArcGIS (np. Studium K1, mapy powodziowe) obsługuje automatyczny fallback.

## Znane luki
- 🔴 Rodziny tabel OD z rocznymi migawkami nie są jeszcze zgrupowane w katalogu (model musi sam zauważyć sufiks daty). Poprawka: pole `rodzina` w `katalog_szukaj` i narzędzie/zapytanie łączące.
- 🔴 Prognoza cudzoziemców 2026–2036 opiera się na 3 rocznych migawkach OD (2023–2025): przedział jest bardzo szeroki; potrzebny dłuższy szereg (BDL?) albo scenariusz.
- 🟡 Opisy w katalogu to nazwy urzędowe + ręczny słownik aliasów (7 tematów). Warto rozszerzyć o opisy kuratorskie dla 30–50 najważniejszych zbiorów (skill „Badacz miejski").
- 🟡 Złączenie przestrzenne z całym zbiorem obiektów (np. 2000 wielokątów) bywa wolne (parki: ~8 s). Potrzebny cache (KV) wyników agregacji.
