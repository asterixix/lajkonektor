# Raporty analityczne

Stan lokalnego kodu: 25.10.2026. Wdrożenie oraz przebieg w docelowych kontach Claude i ChatGPT wymagają osobnego odbioru.

## Przebieg badania

1. Analityk określa pytanie. AI odkrywa źródła i opisy pól; nie zgaduje identyfikatorów.
2. Operacja `analiza` z `tryb=sprawdz` waliduje deklaratywny plan, pobiera dostępne metadane i zwraca SHA256 jego kanonicznej treści. To nie jest wykonanie całego badania.
3. Człowiek poprawia lub zatwierdza plan w rozmowie. `tryb=wykonaj` wymaga identycznego planu, jego identyfikatora i tekstu deklaracji. Serwer nie uwierzytelnia tożsamości ani faktu zatwierdzenia.
4. Serwer pobiera kompletne strony źródeł i liczy wyniki. Błąd lub niebezpieczna niepełność kończy operację; braków nie uzupełnia model.
5. Człowiek ocenia interpretację. Karta eksportuje HTML, JSON i ZIP z tabelami CSV. Samodzielny HTML działa bez sieci i można wydrukować go do PDF.

W hybrydowym interfejsie MCP najpierw odkryj schemat operacji przez `operacje_szukaj`, następnie użyj `operacja_wykonaj({operacja:"analiza",argumenty:{...}})`. HTTP `/api/wywolaj` i testy używają tego samego rejestru. Pełny raport dla MCP Apps trafia do `_meta.karta`; model otrzymuje końcowe tabele i jawny opis podglądu. Kolejne fragmenty odpowiedzi używają kontraktu stronicowania.

## Źródła, operacje i granice

Plan dopuszcza `dane_zapytaj`, `plik_odczyt`, `bdl_dane`, `wskaznik_dzielnic` i zaufaną lokalną migawkę `ludnosc_dzielnic`. Operacje to agregacja, left join, wskaźnik, statystyka i projekcja. Nie przyjmuje kodu użytkownika ani rekurencyjnego wywołania analizy.

Limit to 8 źródeł, 12 operacji, 5000 wierszy **łącznie ze źródłowymi i pośrednimi tabelami** oraz 1 MiB całego wyniku. Identyczne zapytania wykorzystują jeden odczyt w przebiegu, obejmujący wszystkie konieczne strony. Powtórzone kursory, brak postępu i powtórzenia stabilnych identyfikatorów są wykrywane; jednakowe wartości wybranych kolumn nie są dowodem pętli.

Łączenie wymaga jawnych kluczy i kardynalności. Niezgodne daty lub poziomy wymagają zapisanego uzasadnienia, które nie usuwa ograniczenia porównywalności. Metadane zadeklarowane w planie nie stają się niezależnie zweryfikowanymi faktami. Dla wskaźnika brak wartości lub zerowy mianownik daje null. Agregat liczbowy z brakiem w grupie pozostaje null. Jawne przypisanie z geometrii i konflikty nazw dzielnic są opisane w raporcie.

Jednostka miary dotyczy określonej kolumny, a nie dowolnej liczby w tabeli. Wykresy operacji wskazują konkretne osie i miary; ID i lata nie są automatycznie wybierane jako wartości do porównania. Widok formatuje liczby do 3 miejsc po przecinku, a JSON i CSV zachowują pełną precyzję. Wyniki końcowe są pierwsze; dane źródłowe i pośrednie można rozwinąć i włączyć do wydruku.

## Pliki i prywatność

`server/shared/raport.ts` definiuje kontrakt v1. `shared/eksport-raportu.ts` tworzy HTML i pakiet ZIP: `raport.json`, `raport.html`, `README.txt`, `tabele/*.csv`. CSV używa UTF-8 z BOM, średnika, przecinka dziesiętnego i ochrony tekstów przypominających formuły.

Karta MCP korzysta z pobierania przez hosta; odmowa albo brak funkcji odsłania alternatywny zapis JSON i lokalny czytnik pod `/?raport=1`. Import pliku w czytniku nie wywołuje API. Raport nie jest zapisywany przez Lajkonektora na serwerze. Użytkownik może dołączyć własny komentarz do lokalnej kopii; nie zmienia to wyników obliczeń. Polityki przechowywania rozmów po stronie używanego klienta AI pozostają odrębną kwestią.

## Przykład rodzinny i dowody

Odtwarzalny plan, audyt źródeł i wynik są w `docs/10-walidacja/2026-10-25/`. Skrypty z `server/`:

```powershell
node scripts/audyt-rodziny.mjs
node scripts/proba-raportu.mjs --zatwierdzenie="Podstawa wykonania próby technicznej; interpretacja wymaga recenzji"
```

To rzeczywiste API, ale bez płatnego LLM. Przykład łączy migawkę dzieci w 18 dzielnicach, żłobki publiczne i niepubliczne, kluby rodzica, przedszkola oraz kontekst GUS: urodzenia, przyrost naturalny i saldo migracji. Źródło żłobków niepublicznych nie zwraca geometrii; przykład jawnie korzysta z pola opisowego dzielnicy i zachowuje nierozstrzygnięte rekordy. Drugi temat, parki względem liczby mieszkańców, używa tego samego silnika.

Raport nie mierzy kolejek, wolnych miejsc, kosztów ani popytu. Projekcja urodzeń to wariant trendu, nie model zapotrzebowania na opiekę. Poziom gminy nie jest poziomem dzielnicy. Nie ma podstaw do wyliczenia oszczędności ani rekomendacji zamykania placówek.

## Weryfikacja

Testy `raport.test.ts`, `raport-mcp.test.ts`, `eksport-raportu.test.ts`, `metody-raport.test.ts` i `ui/test/raport.test.ts` obejmują walidację, błędy kompletności, stronicowanie, klucze, jednostki, zgodę i zmianę planu, odczyt MCP, wykresy, CSV injection, XSS, puste wyniki i eksport. Statystyka trendu uwzględnia remisy i rzeczywistą oś czasu, z ostrzeżeniami o autokorelacji i zależnościach przestrzennych.

Pozostają odrębne dowody: pełny przebieg na kontach obu klientów, 2–3 sesje badaczy, porównanie czasu z ręczną pracą, pomiar całej odpowiedzi mieszkańca i przegląd licencji źródeł oraz regionalizacji usług. Przygotowany protokół nie oznacza przeprowadzonego badania.
