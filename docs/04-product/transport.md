# Transport: dane na żywo z ZTP i OSM

**Data:** 2026-10-19 · **Pewność:** wysoka (30 testów, test na wdrożonym Workerze i logi `wrangler tail`); niska dla jakości samych szacunków czasu (nie porównywano z innym planerem).

## Wymagania użytkownika i jak je spełniono
| Wymaganie | Rozwiązanie |
|---|---|
| Feed pobierany **na żywo z ZTP** | Worker sprawdza `Last-Modified` plików `GTFS_KRK_{A,T,M}.zip` (HEAD, co 10 min w izolacie) i pobiera zip tylko, gdy wersja się zmieniła; GTFS-RT (`TripUpdates`, `ServiceAlerts`) czytany **przy każdym zapytaniu**. Brak migawki w repo. |
| Analiza **w trakcie pobierania** GTFS | Zip jest czytany strumieniowo (fflate `Unzip` na `fetch().body`), `stop_times` (73 MB po rozpakowaniu) nie trafia do pamięci jako tekst. Wynik to zwarty indeks (ok. 0,45 MB JSON: 4 112 przystanków, 585 wzorców kursów) cache'owany pod kluczem wersji. |
| Lokalizacja startu i celu przez **OSM** | `{tekst: "Rynek Główny"}` → Nominatim (ramka Krakowa); adresy nadal przez oficjalne punkty adresowe MSIP; współrzędne wprost. |
| **Trasa dojścia** do najbliższego przystanku | OSRM profil pieszy (OSM): **jedno** zapytanie `table` dla startu i celu razem (do 8 przystanków o różnych nazwach przy każdym końcu), zwraca realną odległość i czas; przy awarii OSRM szacunek (linia prosta ×1,3). |
| **Tylko odjazdy z tego przystanku**, nie dane całego miasta | Planer rozważa wyłącznie wzorce kursów przechodzące przez przystanki-kandydatów; GTFS-RT pobierany tylko dla feedów używanych przez wybrane opcje i filtrowany od razu do tych przystanków (nic nie jest składowane). Feedy RT są jednak plikami całej sieci (200–300 KB): ZTP nie udostępnia zapytania „tylko ten przystanek". |
| **Komunikaty o utrudnieniach** | `ServiceAlerts` (A, T, M) na żywo; w `trasa` i `odjazdy` pokazywane tylko te dotyczące linii/przystanków z wyniku lub ogólne; osobne narzędzie `utrudnienia`. |

## Narzędzia
- `przystanki_w_poblizu`: przystanki z czasem dojścia pieszo (OSM) i liniami.
- `odjazdy`: najbliższe odjazdy na żywo z przystanku (nazwa albo miejsce) + komunikaty.
- `trasa`: A → B (adres / nazwa miejsca / współrzędne), linie bezpośrednie i z jedną przesiadką, odjazdy na żywo dla pierwszej nogi, komunikaty.
- `utrudnienia`: aktualne komunikaty ZTP, opcjonalnie dla linii.

## Wynik testowy (wdrożony Worker, 19.10 ok. 20:05)
Łojasiewicza 4 → Basztowa 20: **34 min** linią **12** (Norymberska 02 → Teatr Słowackiego 03, 12 przystanków, 19 min jazdy), dojście 7 + 4 min po sieci OSM (510 m i 279 m), najbliższe odjazdy na żywo 20:15 i 20:30; alternatywa linia 18 (53 min). „Dworzec Główny" → „AGH": 29 min linią 179 (4 opcje).
Uwaga: w danych ZTP **nie ma przystanku o nazwie „Basztowa"**, więc zapytanie „odjazdy z Basztowa" zwraca błąd; trzeba podać przystanek po nazwie z `przystanki_w_poblizu` (tu: Teatr Słowackiego, Stary Kleparz).

## Pomiary i ograniczenia zasobów (Cloudflare Workers)
- **Pamięć:** pierwsza wersja budowała sieć z całego zipa w pamięci i kończyła się `exceededMemory` (logi `wrangler tail`). Wersja strumieniowa z tablicami typowanymi mieści się w limicie (test lokalny przy stercie 48 MB).
- **Zimny start:** pełna budowa 3 feedów na Workerze: CPU **12,4 s**, czas 13,4 s (`outcome: ok`). Wymaga płatnego planu Workers (limit CPU 30 s); na planie darmowym (10 ms) by nie zadziałało. Po zbudowaniu zapytania trwają ok. 4–10 s (głównie sieć: Nominatim, OSRM, MSIP, RT).
- **Rozgrzewanie:** cron `*/30 * * * *` sprawdza wersję ZTP i buduje sieć z wyprzedzeniem, więc użytkownik zwykle nie czeka na zimną budowę. Cache API jest lokalny dla centrum danych (placement ustawiony na Warszawę).
- 🟡 Publiczne serwery OSM (Nominatim, OSRM) mają zasady uczciwego użycia i brak SLA; przy większym ruchu trzeba własnej instancji. W repo jest fallback na szacunek, gdy OSRM nie odpowiada; geokodowanie nazw nie ma fallbacku.

## Jakość szacunków (czego nie robi)
- Czas oczekiwania to połowa odstępu z częstotliwości kursów (dzień wzorcowy: najbliższy wtorek/sobota/niedziela), a nie pełny rozkład; pierwsza noga jest korygowana danymi GTFS-RT, jeśli kurs jest w feedzie.
- Maksymalnie jedna przesiadka, przesiadki do 200 m, bufor 3 min; brak wyznaczania tras pieszych między przesiadkami.
- Tramwaje: feed RT nie zawiera `route_id` ani opóźnień; linię rozpoznajemy po `trip_id` ze statycznego GTFS (mapa tylko dla tramwajów).
- ZTP publikuje w `ServiceAlerts` komunikaty testowe („Ogólny tekst specjalny / TEST_1…"); są oznaczane (`testowy`) i pomijane w dopasowaniu.
- Nie ma jeszcze mapy w czacie (MCP Apps) ani pozycji pojazdów (`VehiclePositions` są dostępne, nieużyte).

---

## Aktualizacja 19.10 (wieczór): gminy wokół Krakowa i pociągi

**Zgłoszenie z testu w Claude:** „Staniątki 15” nie zostały znalezione, a planer odpowiadał, że działa tylko dla Krakowa. Dlatego:

| Zmiana | Szczegóły |
|---|---|
| Geokodowanie poza Krakowem | `{tekst}` najpierw w Krakowie (ramka miasta), potem w Małopolsce (`18,9–21,5 E; 49,2–50,5 N`); adres, którego nie ma w punktach MSIP, trafia do OSM. Współrzędne w `miejsce` przyjmowane dla całej Małopolski. |
| Promień dojścia | Gdy brak połączenia, `trasa` sama poszerza dojście z 800 do 1 500 i 3 000 m (wsie, stacje poza miastem); wynik niesie `promien_dojscia_m`. |
| Stacje kolejowe | Do kandydatów dokładamy do 3 najbliższych stacji z promienia 3 km, bo pociąg bywa dużo szybszy niż dojście autobusem. |
| **Feed K: pociągi** | Rozkłady PKP PLK w zbiorczym GTFS składanym dziennie przez mkuran.pl (`polish_trains.zip`, 33 MB; PolRegio, Koleje Małopolskie, Intercity, Arriva, Leo Express, RegioJet i in.). Czytany strumieniowo jak feedy ZTP; budowa 4 s CPU, wynik 0,6 MB JSON (796 przystanków, 1 843 wzorce z Małopolski). Cache pod `Last-Modified`. |
| Dokładne godziny | Dla pociągów wzorzec ma listę odjazdów (minuty od północy, osobno dzień roboczy, sobota, niedziela). Planer czeka do najbliższego odjazdu (do 6 h), a `odjazdy` pokazują godziny z rozkładem oznaczone `rozkład PKP PLK (bez danych na żywo)`. |
| Odporność | Awaria mkuran.pl nie blokuje komunikacji miejskiej: feed K jest opcjonalny (ostrzeżenie w logu). |

**Wynik testowy (lokalnie, wieczór 19.10):** Dworzec Główny → Staniątki 15: pociąg SKA3 Kraków Główny → Podłęże 22:29, 70 min łącznie z dojściem; Rynek Główny → Wieliczka Rynek: tramwaj 1 + SKA1 Kraków Grzegórzki → Wieliczka Rynek-Kopalnia 22:40, 50 min; `odjazdy` z Krakowa Głównego: IC Świnoujście 22:19, SKA3 Tarnów 22:29 itd.

**Czego to nie robi:** pociągi bez opóźnień na żywo (mkuran.pl publikuje `updates.pb`, ale „upstream bywa niestabilny”, nie podpięte); dalej maks. jedna przesiadka i transfery do 200 m; trasa na mapie to schemat odcinków między przystankami; zależność od zewnętrznego agregatora (licencja: dane PKP PLK, atrybucja w stopce karty). Realne połączenia nad ranem i z przesiadkami na dłuższych trasach (np. do Zakopanego) wymagają sprawdzenia w rozkładzie przewoźnika.
