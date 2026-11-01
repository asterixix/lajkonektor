# Hybrydowy MCP — kontrakt lokalny 25.10.2026

Pod istniejącym `/mcp` model odkrywa dokładnie siedem narzędzi: `katalog_szukaj`, `zbior_opis`, `dane_zapytaj`, `miejsce_szukaj`, `osm_obiekty`, `operacje_szukaj`, `operacja_wykonaj`. Nie ma osobnego endpointu zgodności. Dotychczasowe funkcje, w tym równolegle rozwijana `analiza`, pozostają operacjami we wspólnym rejestrze. `/api/wywolaj` nadal przyjmuje ich nazwy.

Przykład: `operacje_szukaj({temat:"planowanie"})` → pełny opis i schemat → `operacja_wykonaj({operacja:"planowanie_w_punkcie",argumenty:{miejsce:{lat:50.06,lon:19.93}}})`. Bramka waliduje argumenty schematem z tego samego rejestru; nie wykonuje kodu ani niezarejestrowanych nazw. Wyszukiwanie zwraca najwyżej trzy opisy oraz `nastepny_offset`.

Wynik ma `status`: `poprawna`, `czesciowa`, `pusta`, `niedostepna` albo `wymaga_wyboru`. Stan nie zastępuje szczegółowych pól `kompletne`, ostrzeżeń i dostępności warstw. Pusta odpowiedź nie dowodzi braku zjawiska. Brak daty stanu pozostaje jawny; `_dowod.pobrano` to czas wykonania wyniku.

Zwykła odpowiedź modelowa mieści się w 24 KiB UTF-8, wyszukiwanie schematów w 32 KiB. Dłuższe odpowiedzi mają `format:"fragmenty_json"`, `fragmenty:[{sciezka,wartosc}]`, `dowody_i_ograniczenia`, `status_danych` i `nastepny_kursor`. Następną stronę pobiera to samo narzędzie z tymi samymi argumentami oraz `kursor_odpowiedzi`. Ścieżki są tablicami kluczy/indeksów do odtworzenia danych, nie tekstem kodu. Nie przecinamy JSON ani pojedynczych liczb. Zmiana danych unieważnia kursor; aktualizacja czasu wykonania nie zmienia tożsamości danych. Pole większe od strony wymaga zawężenia zapytania.

`structuredContent` i `content` mają dane dla modelu. Prezentacyjna geometria jest usunięta z nich i trafia do `_meta.karta` razem z pełnym wynikiem dla UI. Wspólna karta i czat odczytują `_meta.karta`; model jej nie potrzebuje. Zdarzenia NDJSON nadal mają typy `narzedzie`, `wynik`, `tekst`, `blad`, `koniec`. Zasób karty to `ui://lajkonektor/karta-v2.html`. Po wdrożeniu wymagane ponowne połączenie konektorów.

`miejsce_szukaj` zachowuje typ/ID OSM, pełną nazwę, adres i kategorię. Deduplikacja nie scala obiektów tylko dlatego, że są blisko. Resolver zwraca `wymaga_wyboru` z kandydatami; agent przerywa dobieranie miejsca i pyta użytkownika. Karta pokazuje mapę i ponumerowaną listę. Wybrany punkt trafia do rozmowy jako współrzędne. Host bez tej możliwości ma odpowiednik tekstowy.

`osm_obiekty` oferuje akademiki, uczelnie, biblioteki, apteki, szkoły, przedszkola, parki, przystanki, toalety i wodopoje. Promień ≤5 km, limit ≤100, zakres 18.9–21.5 E i 49.2–50.5 N. Dane Overpass/OSM nie zastępują kompletnego rejestru usług; zachowujemy atrybucję i datę stanu z odpowiedzi.

Źródła analityczne MSIP stronicują z kontrolą powtarzanych stron. Warstwy planowania, także działki, mają maszynowe flagi dostępności i kompletności. Diagnostyka odpytuje rzeczywiste warstwy adresów, działek, MPZP i projektu planu ogólnego. Cache obejmuje testy źródeł i czas ich wykonania, a `worker.colo/kraj` pochodzi z bieżącego żądania.

Testy lokalne nie potwierdzają produkcji ani działania w docelowych hostach.
