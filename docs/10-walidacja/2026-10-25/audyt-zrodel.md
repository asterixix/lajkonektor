# Audyt źródeł usług dla rodzin

Odczyt: 2026-10-25T01:03:58.453Z. Dowody: [audyt-zrodel.json](audyt-zrodel.json). Generator: `node scripts/audyt-rodziny.mjs` z server/.

| Źródło | Wynik | Wiersze | Kompletność |
|---|---|---:|---|
| zlobki_publiczne | odpowiada | 35 | true |
| zlobki_niepubliczne | odpowiada | 81 | false |
| kluby_rodzica | odpowiada | 51 | true |
| przedszkola_samorzadowe | odpowiada | 68 | false |
| przedszkola_niesamorzadowe | odpowiada | 88 | false |

## Ograniczenia

- Pojedyncza próba dostępności, nie test obciążenia ani walidacja scenariusza w kliencie AI.
- Liczba miejsc nie oznacza wolnych miejsc ani popytu. Daty importu nie zastępują dat stanu danych.
- Dane przedszkoli opisują dzieci uczęszczające w roku szkolnym, a nie pojemność placówek.
- Brak danych o kosztach i wykorzystaniu nie pozwala oszacować oszczędności.

Wyszukiwanie GUS znajduje kandydatów zmiennych, których definicje trzeba sprawdzić. Szereg urodzeń, jeśli pobrany, dotyczy gminy Kraków. Nie jest szeregiem 18 dzielnic. Licencje i okresy pozostałych tabel wymagają sprawdzenia przed publikowaniem rekomendacji.
