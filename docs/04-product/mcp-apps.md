# MCP Apps: karty wyników Lajkonektora

**Data:** 2026-10-19 · **Pewność:** wysoka dla budowy, testów i działania w harnessie (host MCP Apps z SDK); **niska dla wyglądu w prawdziwym Claude, ChatGPT i innych klientach: tego jeszcze nie sprawdzono.**

## Co to jest
Każde narzędzie zwraca zwykły wynik MCP **oraz** wskazuje kartę (`_meta.ui.resourceUri` + starszy klucz `ui/resourceUri`). Klient z obsługą MCP Apps pokazuje kartę w czacie, pozostałe dostają ten sam wynik jako tekst.

- **Jedna karta dla wszystkich narzędzi:** zasób `ui://lajkonektor/karta.html` (MIME `text/html;profile=mcp-app`, ok. 790 KB, samodzielny: CSS, czcionki Lato i logo jako `data:`, bez zewnętrznych domen, CSP puste). Widok wybiera pole `_widok` w wyniku.
- **16 narzędzi:** 15 publicznych + `ui_kontury_parkow` (`visibility: ["app"]`, tylko dla karty parków; model go nie widzi).
- **Tryb tekstowy (Perplexity, Gemini, każdy klient bez UI):** `content[0].text` to JSON z polskim polem `podsumowanie` (`src/podsumowanie.ts`) i pełnymi danymi. Karta niczego nie dodaje do danych, tylko je pokazuje.

## Narzędzie → widok
| Narzędzie | Widok | Co pokazuje |
|---|---|---|
| `odjazdy` | odjazdy | tablica odjazdów na żywo, opóźnienia, komunikaty ZTP |
| `trasa` | trasa | opcje i oś czasu (dojście, linia, przesiadka), mapa |
| `przystanki_w_poblizu` | przystanki | mapa i lista z czasem dojścia pieszo |
| `utrudnienia` | komunikaty | utrudnienia ZTP (testowe oznaczone) |
| `parki_geometria` | parki | mapa konturów, zgodność powierzchni OD i OSM, pokrycie 46/78 |
| `dane_zapytaj` | tabela | tabela z sortowaniem, przełącznik tabela/słupki |
| `plik_odczyt` | plik | jak tabela + profil kolumn, uwagi o pliku |
| `bdl_dane` | szereg | duża liczba, zmiana r/r, wykres, min/maks |
| `prognoza` | prognoza | wykres z pasmami 80% i 95%, tabela, ostrzeżenia, błąd backtestu |
| `katalog_szukaj`, `zbior_opis`, `bdl_szukaj`, `dane_gov` | katalog, opis_zbioru, bdl_lista, dane_gov | listy i opisy zbiorów |
| `adres_na_punkt` | adres | adres, kod, dzielnica, współrzędne |
| `status_zrodel` | status | dostępność źródeł, przycisk „Sprawdź ponownie” |

Stany wspólne: ładowanie (`ontoolinput`), błąd (z przyciskiem statusu źródeł, np. HTTP 522), widok ogólny dla nieznanego `_widok`.

## Jak to zbudowane
- Źródła: `server/ui/src` (TypeScript bez frameworka, widoki to funkcje zwracające HTML, mapa i wykres to SVG). Rejestr widoków: `widoki/rejestr.ts`; nazwy w `widoki/nazwy.ts` (typ wymusza kartę dla każdej nazwy, serwer jest sprawdzany testem).
- Budowa: `npm run build:ui` (esbuild → `src/ui/karta.generated.ts` i `ui/dist/karta.html`, oba w `.gitignore`). Uruchamia ją `wrangler` (`build.command`) i `npm test`.
- Wygląd z `brand/tokens.css` i `brand/znak-128.png`; czcionki pobiera `scripts/pobierz-czcionki.mjs` (do `ui/fonts`).
- Paczka Workera po zmianie: 2,9 MiB, 574 KiB gzip (sprawdzone `wrangler deploy --dry-run`).

## Harness i fixtury
- `node --experimental-strip-types scripts/harness/serve.mjs` → `http://localhost:8788/#odjazdy`. Host z `AppBridge` z SDK, karta w iframe `sandbox="allow-scripts"` (jak w prawdziwych hostach), wywołania z karty idą do serwera MCP w tym samym procesie (albo do wdrożonego: `MCP_URL=https://lajkonektor.sendyka.workers.dev/mcp`). Przełącznik szerokości 360/520/680.
- Fixtury to prawdziwe wyniki narzędzi z dnia nagrania: `node --experimental-strip-types scripts/zapisz-fixtury.mjs` (wymaga internetu) → `test/fixtury/*.json`.

## Testy
- `test/aplikacje.test.ts` (offline): każde narzędzie wskazuje kartę, pomocnicze jest ukryte, zasób ma właściwy MIME i brak zewnętrznych skryptów, wynik ma `podsumowanie` i `_widok`.
- `ui/test/widoki.test.ts` (offline): każdy widok renderuje się z fixtury bez `undefined`/`NaN`/`null` i ma stopkę ze źródłem; stan błędu.
- Razem `npm test`: 73 testy (część na żywych API miasta).

## Błędy znalezione przy przeglądzie kart (naprawione)
- `sortuj` rozcinał nazwy kolumn po spacji, więc `plik_odczyt` z kolumną „Cena m 2 …” sortował po złej kolumnie; puste wartości trafiały na górę. Teraz kierunek to tylko ostatnie `asc`/`desc`, puste zawsze na końcu.
- `bdl_dane` zwracało samo „ogółem” jako nazwę; dodano `temat` z BDL (np. „Stopa bezrobocia rejestrowanego”).
- `dane_gov` zwracało opisy z surowym HTML; teraz czysty tekst (dotyczy też klientów bez kart).
- Dwa parki (Planty Bieńczyckie i Krakowskie) dostawały ten sam kontur OSM; teraz jeden obiekt OSM = jeden park (pokrycie spadło z 47 do 46 parków, z 46,9% do 44,9% powierzchni).

## Czego nie wiemy
- Jak karty wyglądają i zachowują się w prawdziwym Claude (claude.ai i aplikacja) oraz w ChatGPT: harness jest zgodny z SDK, ale hosty mogą inaczej liczyć wysokość, motyw (jasny/ciemny) i uprawnienia do wywołań narzędzi z karty. Karta parków dociąga kontury narzędziem `ui_kontury_parkow`, więc wymaga, by host pozwalał karcie wołać serwer.
- Obsługę MCP Apps w poszczególnych klientach bierzemy z dokumentacji SDK, nie z własnych testów. Perplexity i Gemini: zakładamy tryb tekstowy.
- Tryb ciemny: karta wymusza jasny motyw (`color-scheme: light`).
