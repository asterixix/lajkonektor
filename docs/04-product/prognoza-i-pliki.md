# Prognoza i odczyt plików

**Data:** 2026-10-19 · **Pewność:** wysoka dla działania (73 testy w repo, e2e na wdrożonym Workerze), średnia dla merytorycznej jakości prognoz (kilka metod, bez walidacji na wielu szeregach).

## `prognoza`: deterministyczna projekcja szeregu
Wejście: punkty `{x, y}` (np. z `bdl_dane`), horyzont 1–20 kroków, metoda `auto|liniowy|wykladniczy|holt`, opcjonalnie `ostatnie_punkty` (ucięcie historii) i `krok`.

| Metoda | Co robi | Przedział |
|---|---|---|
| liniowy | OLS, stały przyrost | t-Studenta (n−2 df), 80% i 95% |
| wykladniczy | OLS na logarytmach (wartości > 0), stała zmiana procentowa | na skali log, przeliczony |
| holt | wygładzanie z trendem; alfa, beta z siatki 20×20 (minimalizacja błędu jednokrokowego) | przybliżony (σ·√h) |

- **Wybór w trybie auto:** najmniejsze MAE w backteście z przesuwanym początkiem (ostatnie ≤3 punkty), remis lub brak backtestu → liniowy.
- **Odpowiedź niesie:** metodę i jej opis, parametry, R², MAE i MAPE backtestu, porównanie metod, prognozę z przedziałami i **ostrzeżenia**: krótka seria (<6), nierówne odstępy, horyzont > ½ serii, przedział szerszy niż wartość, MAPE > 10%, kierunek prognozy przeciwny do trendu z ostatnich 5 punktów.
- **Powtarzalność:** brak losowości (bootstrapu), dwa wywołania dają ten sam wynik (test).
- **Sprawdzone na prawdziwych danych (BDL 60270, stopa bezrobocia, powiat m. Kraków, 2015–2025):** 4,4; 3,5; 2,7; 2,3; 2,0; 3,1; 2,8; 2,3; 1,9; 2,0; 2,5 → wybrano model wykładniczy (MAE 0,34), prognoza 2026: 1,9% (80%: 1,4–2,6), ale z ostrzeżeniami (MAPE 14,8%, przedział 95% szerszy niż wartość). To uczciwy sygnał, że szereg ma załamanie (2020) i trend jest słaby; model „ciągnie" spadek z lat 2015–2018. Użyj `ostatnie_punkty`, by oprzeć projekcję na nowszym okresie.
- 🔴 **Cudzoziemcy 2026–2036:** tabele OD to roczne migawki 2023, 2024, 2025 (3 punkty). Prognoza jest możliwa, ale z przedziałem t(df=1) praktycznie bezużytecznym i ostrzeżeniem „krótka seria". Do pitchu trzeba albo dłuższego szeregu (np. GUS BDL, jeśli istnieje dla Krakowa; do zbadania), albo uczciwie pokazać scenariusz z szerokim przedziałem.

## `plik_odczyt`: CSV, XLSX, GeoJSON/JSON
Wejście: `url` https, opcjonalnie `format`, `arkusz`, `separator`, `pola`, `sortuj`, `limit` (≤500), `offset`, `grupuj_po` + `agreguj` (liczy serwer), `geometria`.

- **Formaty:** CSV (wykrywanie separatora `; , TAB |`, cudzysłowy z nową linią, przecinek dziesiętny i spacje tysięcy, kodowanie UTF-8 z awaryjnym windows-1250); XLSX (własny parser OOXML: arkusze, współdzielone i wstawione napisy, encje, rozbite runy, daty rozpoznawane po formacie komórki → ISO); GeoJSON (typ geometrii, środek, ramka, pole wielokąta w ha, ostrzeżenie przy innym układzie niż WGS84); JSON tablica obiektów.
- **Profil kolumn w każdej odpowiedzi:** typ, liczba pustych, min/max/suma/średnia (liczby), liczba unikalnych i przykłady (tekst). Pozwala modelowi weryfikować liczby bez czytania wszystkich wierszy.
- **Bezpieczeństwo:** tylko https; pierwszy adres musi należeć do `*.gov.pl` lub `*.krakow.pl`; bez IP, `localhost`, portów niestandardowych i danych logowania; przekierowania obsługiwane ręcznie (≤4) i walidowane (dane.gov.pl przekierowuje do serwera dostawcy, np. `api.rednet24.pl`); limit 8 MB i 25 s; maks. 50 000 wierszy; rozpakowane arkusze do 60 MB.
- **Sprawdzone na prawdziwych plikach (przez Workera):** CSV ceny mieszkań (47 kolumn, 100 wierszy), XLSX Dom Development (1 457 wierszy, ceny m² 12 502–23 000 zł), GeoJSON dzielnic Krakowa z MSIP (18 dzielnic, suma pól **32 414 ha**; oficjalnie ok. 32 685 ha, różnica 0,8% wynika z przybliżonego rzutowania lokalnego).

## Znane ograniczenia
- Parser XLSX jest minimalny (bez formuł z obliczaniem, bez scalonych komórek, bez wielu nagłówków); pliki `.xls`, `.zip`, PDF nie są obsługiwane (PDF to osobny temat: OCR/tekst).
- Hosty spoza `gov.pl`/`krakow.pl` są odrzucane także wtedy, gdy dane są publiczne (np. GUS poza `gov.pl`, Wolne Lektury); listę łatwo rozszerzyć w `plik.ts`.
- GeoJSON: pełne współrzędne nie są zwracane (tylko podsumowanie), by nie zalewać kontekstu.
