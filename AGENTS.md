# AGENTS.md

Lajkonektor („Podłącz Kraków”, zespół JAK): publiczny serwer MCP na Cloudflare Workers udostępniający otwarte dane Krakowa wyłącznie do odczytu (Otwarte Dane UMK, MSIP, GUS BDL, dane.gov.pl, ZTP GTFS/GTFS-RT, rozkłady kolejowe, OSM). Odbiorcy: mieszkańcy, badacze, firmy, dziennikarze i urzędnicy. Kod jest w `server/`, dokumentacja w `docs/`, materiały marki w `brand/`. Dokumentację, nowe komentarze i komunikaty dla użytkownika pisz po polsku.

Przy rozbieżności między dokumentacją a kodem rozstrzygają kod, konfiguracja i testy. Pełny opis techniczny: `docs/dokumentacja-techniczna.md`.

## Polecenia (uruchamiaj z `server/`)

- `npm ci`: instalacja zależności z lockfile. Projekt używa ESM, importów `.ts` i JSON z `with { type: "json" }`; Node musi obsługiwać bezpośrednie uruchamianie TS przez usuwanie typów (sprawdzono na Node 24.15.0).
- `npm test`: uruchamia `scripts/build-ui.mjs` (pretest), potem `node --test test/*.test.ts test/site/*.test.ts ui/test/*.test.ts`. Domyślnie offline, obejmuje również stronę.
- `node --test test/site/*.test.ts`: testy klienta strony, treści, kontrastu, odtwarzacza i czatu; uruchamiaj przy zmianach strony.
- Testy „na żywo” (prawdziwe API miasta, GUS, ZTP i OSM: 5–240 s każdy) są domyślnie pomijane. Wszystkie: `NA_ZYWO=1 npm test` (bash) albo `$env:NA_ZYWO="1"; npm test` (pwsh). Po nich w PowerShell: `Remove-Item Env:NA_ZYWO`.
- Wybrany plik: `node --test test/tools.test.ts`. Wcześniej `npm run build:ui`, jeśli `src/ui/karta.generated.ts` nie istnieje lub jest nieaktualny.
- `npm run typecheck`: buduje kartę, potem sprawdza TypeScript serwera, UI i strony (`site/tsconfig.json`).
- `npm run build:ui`: samodzielny HTML karty; `npm run build:site`: Vite + React do `site/dist/`.
- `npm run dev` (`wrangler dev`): odczytaj faktyczny port z terminala. `npm run deploy` (`wrangler deploy`) wdraża Worker i assets.
- Harness MCP Apps: `node --experimental-strip-types scripts/harness/serve.mjs`, domyślnie localhost:8788 (`HARNESS_PORT` zmienia port). `MCP_URL` przełącza go na inny serwer, np. wdrożony `/mcp`.

## Mapa kodu

- `server/src/index.ts`: wejście Workera, `/mcp`, `/api/wywolaj`, `/api/czat`, `/kafelki/`, `/diag`, `/health`; cron co 30 min przygotowuje sieć transportu przez `wczytajSiec()`. Nie odświeża katalogu ani migawek analitycznych.
- `server/src/server.ts`: rejestracja operacji przez `createServer(cf, origin)` i lokalne `narzedzie(...)`, które buduje rejestr operacji. `WIDOK` mapuje operację na widok karty. Instrukcje serwera dla modelu: `src/instrukcje.ts`.
- `server/src/kontrakt.ts`: lista siedmiu publicznych narzędzi (`PUBLICZNE`), statusy wyników i limity bajtów; `src/schematy.ts`: schematy wyników.
- Pozostałe moduły `server/src/`: `katalog.ts` (wyszukiwanie zbiorów), `zapytanie.ts` (`dane_zapytaj`), `transport.ts` + `siec.ts` + `gtfsrt.ts` (transport), `widok.ts` (karta składana), `prognoza.ts`, `plik.ts` (CSV/XLSX/GeoJSON), `osm.ts` (Nominatim, cache 24 h, `szukajMiejsc`, `wybierzMiejsce`: najlepsze trafienie z adnotacją), `nominatim.ts` (koordynator DO w UE), `overpass.ts` (10 kategorii OSM z migawki `data/osm-obiekty.json`, budowanej przez `scripts/build-osm-obiekty.py` z ekstraktu Geofabrik; publiczny Overpass nie dopuszcza użycia automatycznego), `parki.ts`, `zewnetrzne.ts` (BDL, dane.gov.pl), `migawki.ts` (R2, awaryjne wyniki ≤24 h).
- `server/src/analityka.ts`: obliczenia i migawki dzielnic/ludności; `analizy.ts`: kompozycja analiz; `raport.ts`: operacja `analiza` (tryby `sprawdz`/`wykonaj`, SHA256 planu); `eksport-danych.ts`: `dane_eksportuj`; `planowanie.ts`, `geo.ts`, `komunikaty.ts`.
- `server/src/sources.ts`: fetch, timeout, retry, błędy ArcGIS, pełne stronicowanie, `zCache`; `api.ts`: HTTP dla strony; `limit.ts`: liczniki; `kafelki.ts`: proxy OSM; `status.ts`: diagnostyka; `podsumowanie.ts`: polskie podsumowania wyników.
- `server/src/wersja.ts`: wspólna `WERSJA` dla MCP, `/health` i User-Agentów. Zachowuj zgodność z `package.json` (`test/wersja.test.ts`).
- `server/src/czat.ts`: czat demo przez Eden AI, korzystający z MCP w procesie i NDJSON. Wymaga bindingu `BUDZET`, ważnej `CZAT_POLITYKA` i sekretu `EDEN_AI_API_KEY` (`wrangler secret put EDEN_AI_API_KEY`, lokalnie `server/.dev.vars` wg `.dev.vars.example`). Bez kompletu konfiguracji czat jest zablokowany, a strona działa dalej.
- `server/shared/`: kontrakt raportu (`raport.ts`) i eksport HTML/CSV/JSON/ZIP (`eksport-raportu.ts`, `eksport-danych.ts`), wspólne dla serwera i przeglądarki.
- `server/site/`: strona demo (Vite + React + Motion), serwowana przez assets. Teksty w `site/src/tresc.ts`, przykładowe pytania w `site/src/pytania.ts`, źródła zewnętrznych liczb w `docs/01-discovery/argumenty-dla-miasta.md`. `site/src/komponenty/KartaMostek.tsx` osadza wspólne widoki `ui/src` w Shadow DOM.
- `server/ui/src/`: źródła kart (`main.ts`, `styles.css`, `widoki/`) składane w samodzielny HTML.
- `server/data/`: katalog (`katalog.json`) i migawki analityczne; generatory w `server/scripts/build-*.mjs`.

## Pliki generowane (nie edytuj ręcznie)

- `server/src/ui/karta.generated.ts` i `server/ui/dist/karta.html` tworzy `scripts/build-ui.mjs`; oba są gitignorowane. Zmieniaj źródła i przebuduj.
- `build.command` Wranglera buduje przy wdrożeniu kartę i stronę demo.
- Migawki `server/data/dzielnice.json`, `ludnosc-dzielnic.json`, `hex100.json` tworzy `node --experimental-strip-types scripts/build-analityka.mjs` (wymaga sieci).
- `node --experimental-strip-types scripts/zapisz-fixtury.mjs` zapisuje prawdziwe wyniki MCP do `test/fixtury/`; zmienia też dane nagranego demo.
- Po regeneracji sprawdź diff, daty, kompletność i pokrycie. Nie poprawiaj ręcznie liczb w wygenerowanych danych.

## Dodawanie lub zmiana operacji

- Rejestruj operację w `server/src/server.ts` przez `narzedzie(...)`, ze schematem wejścia (Zod, polskie `describe(...)`) i wyjścia (`src/schematy.ts`) oraz adnotacjami `readOnly`. Nie rozszerzaj listy siedmiu publicznych narzędzi MCP bez uzgodnienia; nowe operacje są dostępne przez bramkę `operacje_szukaj`/`operacja_wykonaj`.
- Dodaj mapowanie w `WIDOK` i fixturę w `server/test/fixtury/`; `ui/test/widoki.test.ts` i `test/aplikacje.test.ts` sprawdzają widoki kart.
- Uzupełnij `podsumowanie.ts`, instrukcje serwera i `site/src/narzedzia.ts`, jeśli zmienia się zakres. Nowy typ widoku wymaga wpisu w `ui/src/widoki/nazwy.ts`, renderera i `widoki/rejestr.ts`.
- Testuj także tekstowy wynik bez MCP Apps.

## Wdrożenie i pułapki

- **Nie usuwaj `placement.region: "gcp:europe-central2"` (Warszawa)** z `wrangler.jsonc`. Połączenia do UMK/MSIP spoza regionu kończyły się HTTP 522.
- Konfiguracja zachowuje `workers_dev: true`, `nodejs_compat` i assets `./site/dist`. Logi i traces Workera są wyłączone.
- R2 `MIGAWKI` (jurysdykcja `eu`) i Durable Objects `BUDZET`, `NOMINATIM` muszą istnieć na koncie przed wdrożeniem.
- `CZAT_POLITYKA` w `wrangler.jsonc` ma datę ważności `waznaDo`; po jej upływie czat się blokuje. Aktualizacja: `scripts/ustaw-polityke-czatu.mjs` i `docs/09-wdrozenie/polityka-czatu-2026-10-25.json`.
- Cloudflare Access na `workers.dev` blokuje klientów MCP przekierowaniem 302; endpoint `/mcp` musi być publiczny.
- Po zmianie narzędzi lub metadanych klient może wymagać ponownego połączenia konektora. Przed pokazem sprawdź `/health`, `status_zrodel`, reprezentatywne wywołanie i kartę w docelowym kliencie.

## Zasady architektury

- Rdzeń to katalog i uniwersalne zapytania; analizy kompozytowe skracają powtarzalne procedury. Zanim dodasz operację, sprawdź, czy potrzebę obsługują istniejące klocki.
- Nie dodawaj zapisu do systemów źródłowych ani wymogu konta do odczytu otwartych danych. Liczby liczy kod, model wybiera narzędzia i wyjaśnia wyniki. Nie zastępuj brakujących danych wiedzą modelu.
- Zewnętrzny klient MCP korzysta z własnego LLM; czat demo wywołuje płatny model przez Eden AI. Rdzeń MCP nie wywołuje LLM.
- Każdy wynik zachowuje źródło, datę i ograniczenia. Brak wyników nie dowodzi braku zjawiska. Częściowa odpowiedź nie reprezentuje automatycznie całego miasta.
- Serwer MCP jest tworzony per żądanie; nie ma wspólnej sesji użytkownika. Cache danych i indeksy sieci mogą być współdzielone.
- Oddzielaj logikę od adapterów Cloudflare (Durable Objects, R2, Cache API), aby umożliwić przeniesienie hostingu.

| Dokument | Zastosowanie |
|---|---|
| `docs/dokumentacja-techniczna.md` | Technologie, dane, architektura, rozwój |
| `docs/04-product/` | Narzędzia uniwersalne, transport, analizy, raporty, MCP Apps, kontrakt hybrydowy |
| `docs/05-design/system-graficzny.md` | Wygląd, kolory, typografia, karty |
| `docs/01-discovery/argumenty-dla-miasta.md` | Źródła liczb na stronie |
| `docs/10-walidacja/2026-10-25/` | Zapis próby raportu na rzeczywistych API (używają go `scripts/audyt-rodziny.mjs`, `scripts/proba-raportu.mjs`) |

Część dokumentów w `docs/04-product/` ma charakter historyczny; implementację sprawdzaj w kodzie.

## Endpointy i kontrakt wyników

| Trasa | Zachowanie |
|---|---|
| `/mcp` | Streamable HTTP MCP, publiczny odczyt, otwarty CORS |
| `POST /api/wywolaj` | JSON `{nazwa, argumenty}` → wynik ze wspólnego rejestru po walidacji Zod. 400: wejście, 429: limit, 502: błąd wykonania/źródła |
| `GET /api/czat` | Dostępność konfiguracji czatu i wybrany model |
| `POST /api/czat` | Agent narzędziowy, strumień NDJSON |
| `/kafelki/{z}/{x}/{y}.png` | Proxy OSM z User-Agentem, cache i ograniczeniami obszaru/zoomu |
| `/diag` | Diagnostyka źródeł; cache 60 s, limit 10/min/IP |
| `/health` | `{ok, name, version}`; sprawdza Worker, nie dostępność API źródłowych |
| `/` i assets | Strona demo; `/?raport=1` czytnik raportów |

Publiczny `/mcp` ma siedem narzędzi: `katalog_szukaj`, `zbior_opis`, `dane_zapytaj`, `miejsce_szukaj`, `osm_obiekty`, `operacje_szukaj`, `operacja_wykonaj`. Pozostałe operacje rejestru (transport, analizy, BDL, dane.gov.pl, pliki, `widok`, `analiza`, `dane_eksportuj`, `status_zrodel`) są dostępne przez bramkę.

- Standard: `katalog_szukaj(temat)` → `zbior_opis(id)` → `dane_zapytaj(id, ...)`. Nie zgaduj identyfikatorów, pól, kodów ani dat.
- MSIP przyjmuje SQL `where`; OD — OData `$filter`. Agregacje `sum/count/avg/min/max` i grupowanie wykonuje serwer. OD stronicuje kursorem (`nastepny_kursor` → `kursor`), MSIP przez `offset`.
- WGS84: punkty `lat/lon`, bbox `[zachód, południe, wschód, północ]`, geometrie `[lon, lat]`.
- Wynik ma status `poprawna`, `czesciowa`, `pusta`, `niedostepna` lub `wymaga_wyboru`. Opakowanie dodaje `podsumowanie` i `_dowod.pobrano` (czas wykonania, **nie data stanu danych**). Pełna karta jest w `_meta.karta`; geometria prezentacyjna nie trafia do `structuredContent`.
- `dane_zapytaj`: do 1000 wierszy, strony modelowe do 24 KiB UTF-8, agregacja OD do 20 tys. wierszy źródłowych. `kompletne=false` nie pozwala przedstawiać sum jako pełnych.
- `analiza` i `dane_eksportuj`: do 8 źródeł, 12 operacji, 5000 wierszy łącznie i 1 MiB wyniku; bez cichego obcinania. Wykonanie i eksport tabel przeliczonych wymagają `id_planu` i zatwierdzenia z rozmowy (deklaracja, nie uwierzytelnienie).

## Dane, cache i ograniczenia interpretacji

- Katalog i migawki `data/*.json` są częścią wdrożenia; świeże dane źródłowe i świeży katalog to różne rzeczy.
- `zCache` używa `caches.default`; w Node bez tego API dane są pobierane bez cache. Nie cache'uj błędu jako poprawnego pustego wyniku.
- GTFS jest indeksowany strumieniowo przez `fflate` i cache'owany według wersji feedu. Nie ładuj całego `stop_times` do tekstu.
- Ludność w analizach MSIP to **zameldowani na pobyt stały**. Liczba miejsc w rejestrze nie oznacza wolnych miejsc; saldo migracji nie opisuje populacji migrantów.
- Geometria parków OSM ma częściowe pokrycie; zawsze uwzględniaj pole `pokrycie`.
- `dostepnosc` używa siatki 100 m i przybliżenia drogi (linia prosta × 1,3); progi z **projektu** planu ogólnego.
- `planowanie_w_punkcie` daje zestawienie informacyjne, nie wypis.
- ArcGIS potrafi zwracać błąd w HTTP 200 i wadliwe stronicowanie; zachowaj obsługę błędu i fallback.
- ZTP ma realtime; kolej ma rozkład bez opóźnień. Zachowuj rozróżnienie „na żywo” / „wg rozkładu”.
- `prognoza` to projekcja trendu (liniowa/wykładnicza/Holt), nie oficjalna prognoza demograficzna.

## Wspólne karty i strona demo

- `ui/src/main.ts` obsługuje hosta MCP Apps; `ui/src/widoki/rejestr.ts` wybiera renderer według `_widok`. Zmianę wspólnych widoków sprawdź w harnessie i na stronie.
- CSP zasobu dopuszcza zasoby z przekazanego `origin`; nie dodawaj zewnętrznych skryptów. Zachowuj atrybucję OSM, dostępność, jasny/ciemny motyw i układ wąski.
- `site/src/markdown.ts` renderuje odpowiedź modelu bez surowego HTML i obrazów, z odrzucaniem niebezpiecznych protokołów.
- Liczby promocyjne na stronie wymagają źródła w `docs/01-discovery/argumenty-dla-miasta.md`.

## Czat i ewaluacja modelu

- `src/czat.ts` wywołuje narzędzia przez rzeczywisty handler MCP w procesie; nie twórz drugiej implementacji narzędzi. Zdarzenia NDJSON: `narzedzie`, `wynik`, `tekst`, `blad`, `koniec`; zachowaj kontrakt `site/src/czatKlient.ts`.
- `LIMIT` w `czat.ts`: historia, długość wiadomości, 5 pytań na rozmowę, do 4 wywołań narzędzi na krok.
- `test/ewaluacja/`: 50 pytań i heurystyczna ocena. Przebieg z modelem wymaga klucza i generuje koszt: `node --env-file=.dev.vars test/ewaluacja/uruchom.ts --filtr=sprzeciw --n=1`.

## Bezpieczeństwo i limity

- Otwartego CORS i `readOnlyHint` nie traktuj jako kontroli kosztów ani uprawnień. Nie zapisuj sekretów do repo ani logów.
- `src/limit.ts` używa `caches.default`: liczniki są przybliżone. API narzędzi: 60/min/IP; kafelki: 240/min/IP; czat: 10/min/IP i 5 pytań na rozmowę; `/diag`: 10/min/IP. `/mcp` nie ma limitera po IP, bo klienci AI łączą się ze wspólnych adresów.
- Kafelki: bbox 19.0–21.2 E / 49.5–50.5 N, zoom 9–18. Nie zamieniaj proxy w dowolny pośrednik URL-i.
- `plik_odczyt`: CSV/XLSX/GeoJSON/JSON, maks. 8 MiB i 50 tys. wierszy. Pierwszy URL: HTTPS na `gov.pl`/`krakow.pl`; każdy skok przekierowania sprawdza protokół, port, dane logowania i hosty lokalne. Nie jest to pełne zabezpieczenie SSRF.
- Nie loguj treści rozmów; sprawdzaj, czy komunikaty błędów nie zawierają argumentów lub adresów użytkownika.

## Porządek pracy

1. Sprawdź `git status` i zachowaj istniejące zmiany. Określ warstwę zmiany: źródło, logika, MCP/API, karta, strona lub czat.
2. Kod: uruchom odpowiednie testy i typecheck. Zmiana strony wymaga `test/site/*.test.ts` i `build:site`; zmiana wspólnych kart — kontroli wizualnej w obu kontekstach.
3. Oddzielaj dowody z testów offline, live i docelowego klienta. Pominięte testy nie potwierdzają działania API.
4. Nie commituj sekretów, `node_modules`, `.wrangler`, `dist` ani generowanego bundle'a karty.
