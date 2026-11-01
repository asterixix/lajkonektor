# Odbiór lokalny — 25.10.2026

## Potwierdzone wykonanie

- `npm test`: 298 testów, 277 zaliczonych, 21 pominiętych live, 0 błędów. Obejmuje także testy strony.
- `npm run typecheck`: kod 0 (serwer, karta i strona).
- `npm run build:site`: kod 0. Pozostaje ostrzeżenie Vite o pakiecie JS ponad 500 kB.
- Testy raportów obejmują rzeczywisty handler MCP, limity, zgodę i identyfikator planu, kompletność, łączenia, puste tabele, eksport, wykresy i stabilność kursora mimo zmiany czasu wykonania.
- `proba-raportu.mjs` pobrał rzeczywiste publiczne dane bez LLM: 8 źródeł, 20 tabel, 18 dzielnic. Drugi temat (parki) działa przez ten sam silnik i zwraca 18 wierszy.
- W przeglądarce potwierdzono lokalny import JSON, render raportu, pobranie ZIP i dodanie komentarza do lokalnej kopii. Komentarz próbny nie został zapisany w źródłowym raporcie.
- Przy szerokości 360 px dokument miał 345 px, bez poziomego przepełnienia strony.
- Ten sam raport wyrenderowano w sandboxowanym iframe harnessu MCP Apps (680 px). To lokalny host, nie Claude/ChatGPT. Wybór `raport_rodziny` wymaga pliku raportu w tym folderze.

## Granice interpretacji

Miejsca w rejestrze nie oznaczają wolnych miejsc ani popytu. Zameldowanie nie obejmuje wszystkich mieszkańców. Saldo migracji nie jest liczbą migrantów. Warstwa żłobków niepublicznych nie ma geometrii; 15 etykiet dzielnic pozostało nierozstrzygniętych. Nie rozdzielamy wielkości miejskich między dzielnice. Projekcja urodzeń jest scenariuszem trendu, nie prognozą potrzeb opieki.

## Pozostały odbiór

Do wykonania: próby w Claude/ChatGPT, 2–3 sesje badaczy, pomiar kosztu całej odpowiedzi, nagranie i pitch z zegarem. Pełny łańcuch przechowywania w Europie i warunki ponownego wykorzystania źródeł wymagają potwierdzenia. PDF raportu analitycznego powstaje przez druk HTML; nie sprawdzono jeszcze paginacji każdego wydruku.

Nie wdrożono zmian ani nie wysłano zgłoszenia. Odbiór techniczny nie zastępuje akceptacji merytorycznej.
