# Argumenty dla miasta i jury: źródła i weryfikacja

Data weryfikacji: 2026-10-21. Treść strony (`server/site/src/tresc.ts`) może używać wyłącznie wierszy ze statusem „potwierdzone". Liczby mają przy sobie źródło.

## Potwierdzone

| Twierdzenie | Źródło | Uwagi |
|---|---|---|
| ChatGPT i Gemini odpowiedziały poprawnie na 0% pytań o USAspending i 2,1% o CDC PLACES. Z serwerami MCP dokładność wyniosła 95% dla obu zbiorów. | U.S. Digital Corps, *Improving LLM Access to Federal Open Data*, 18.05.2026: digitalcorps.gsa.gov/pdfs/MCP_Report.pdf, digitalcorps.gsa.gov/blogs/model-context-protocol | To mała próba (pilotaż, n=6 pytań w jednej rundzie). Raport podaje też 18% → 95% w streszczeniu i 100% / 89,5% w rundzie 3, więc na stronie pisać „do 95%" z opisem pilotażu. **Poprzednia treść strony (5% i 0%) była błędna.** |
| Po podaniu modelowi odpowiedzi API model odpowiadał poprawnie prawie w 100%, więc wąskim gardłem jest pobranie danych, nie rozumowanie. | Ten sam raport, Key Findings | Dobre uzasadnienie architektury „model pyta, kod liczy". |
| Zurych: serwer MCP nad ponad 900 zbiorami otwartych danych miasta, 20 narzędzi, np. pogoda na żywo i 36 parkingów. | liip.ch/en/blog/city-of-zurich-s-900-open-data-sets-now-have-an-mcp-server | Projekt społeczności (autor: Hayal Oezkan), wdrożony i utrzymywany przez firmę Liip, **nie przez miasto**. Pisać „działa serwer MCP", nie „miasto uruchomiło". |
| Boston: eksperyment z MCP jako „agentic middleware" nad otwartymi danymi miasta, projekt Open Context z Burnes Center i GovLab. | rebootdemocracy.ai/blog/boston-agentic-middleware | Boston mówi wprost, że model bez dostępu do danych odpowiada z treningu albo zmyśla i że sam serwer MCP kosztuje niewiele w utrzymaniu. |
| Menlo Park (Kalifornia): czat „Laurel" od Citibot kosztuje 9 900 USD rocznie (czat WWW), plus 2 100 USD za wielojęzyczność. Gazeta The Almanac oceniła, że bot odpowiadał z „mieszanym skutkiem". | almanacnews.com, 17.08.2026 | Czat z interfejsem to inny produkt niż warstwa danych. Porównanie uczciwie: „jedna z miejskich usług czatu kosztuje…". |
| Cloudflare Workers Paid: 5 USD abonamentu, 10 mln żądań w cenie, potem 0,30 USD za milion; 30 mln ms CPU w cenie, potem 0,02 USD za milion ms. | developers.cloudflare.com/workers/platform/pricing | Szacunek strony (30 ms CPU na wywołanie) przelicza się poprawnie: 100 tys. dziennie = 6,20 USD, 200 tys. = 8,00 USD miesięcznie. Etykieta „szacunek, nie pomiar" zostaje do testu obciążeniowego. |
| 36% dorosłych Polaków korzystało z generatywnej AI w ciągu trzech miesięcy przed badaniem (maj 2026), w grupie 18-24 lata 81%, wśród seniorów 8%. | CBOS, *Korzystanie ze sztucznej inteligencji*, K 064/26, cbos.pl/SPISKOM.POL/2026/K_064_26.PDF (n=1041) | Mocny argument „mieszkańcy już pytają AI". Różnica pokoleniowa jest ograniczeniem: to nie jest narzędzie dla każdego mieszkańca. |
| Portal Otwarte Dane Krakowa działa od kwietnia 2024; pierwszy pakiet to 27 zbiorów; w marcu 2026 miasto podaje ok. 140 zasobów. | strategia.krakow.pl (09.05.2024), krakow.pl/aktualnosci/311667 (03.03.2026) | Katalog Lajkonektora (1203 pozycje) obejmuje też warstwy MSIP, więc nie porównywać go wprost z „140". |
| Zarządzenie 1186/2025 Prezydenta Miasta Krakowa z 16.05.2025 tworzy stanowisko Głównego Miejskiego Stratega ds. Informatyzacji. § 3 ust. 1 pkt 3: portfel Smart City, w tym AI i uczenie maszynowe w usługach publicznych. § 3 ust. 2 pkt 5: opiniowanie rozwiązań Smart City pod kątem zasadności i efektywności kosztowej. § 3 ust. 1 pkt 4: wymiana danych w Metropolii Krakowskiej. | Plik `ZPMK_2025_1186.pdf` (BIP Krakowa), przeczytany w całości | Strateg opiniuje rozwiązania pod kątem kosztu, więc koszt hostingu jest argumentem. Nie wynika z zarządzenia, że AI jest „projektem strategicznym". |
| Rozporządzenie wykonawcze 2023/138 wskazuje zbiory o wysokiej wartości (m.in. mobilność, dane geoprzestrzenne, statystyka, meteorologia), które organy publiczne udostępniają w formie umożliwiającej maszynowy odczyt przez API. Podstawa: dyrektywa 2019/1024. | eur-lex.europa.eu/eli/reg_impl/2023/138/oj, eur-lex.europa.eu/PL/legal-content/summary/open-data-and-the-reuse-of-public-sector-information.html | Streszczenie z EUR-Lex; przed cytowaniem artykułu sprawdzić jego numer. |
| MCP stworzył Anthropic w 2024, w grudniu 2025 trafił do Agentic AI Foundation (Linux Foundation); obsługują go Claude, ChatGPT, Gemini i Copilot. | fedscoop.com, 2026 | Odpowiada na pytanie „czy to nie jest rozwiązanie jednego producenta". |
| Microsoft Copilot Studio obsługuje serwery MCP (narzędzia i zasoby), z kontrolami korporacyjnymi: uwierzytelnianie, ochrona przed wyciekiem danych (DLP), integracja z siecią wirtualną. Integracja MCP jest ogólnie dostępna. | learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp; microsoft.com/en-us/copilot/blog/copilot-studio/model-context-protocol-mcp-is-now-generally-available-in-microsoft-copilot-studio | Podstawa kierunku „serwer MCP dla urzędników". Copilot Studio nie obsługuje jeszcze promptów MCP, tylko narzędzia i zasoby. |
| Gemma 4 (Google DeepMind) wyszła 2.04.2026 jako otwarty model na licencji Apache 2.0, w rozmiarach 31B dense, 26B MoE oraz E4B i E2B (mobilne). | x.com/GoogleDeepMind/status/2039735446628925907; mashable.com (Gemma 4) | Podstawa kierunku „tani czat dla mieszkańców". Strona MindStudio podaje błędny rok 2025, nie cytować. Jakość odpowiedzi po polsku nie była testowana. |

## Niepotwierdzone, wycofane ze strony

- **Seul** (serwer MCP z danymi publicznymi, lipiec 2026, odświeżanie co 5 minut): nie znaleziono źródła. Znaleziono tylko miejski system LLM dla urzędników i portal danych (87 tys. zbiorów), to inny fakt.
- **Toronto** (serwer MCP na Cloudflare Workers): nie znaleziono źródła.
- **Kirkland** (czat miejski, 18,5 do 30 tys. USD rocznie): wyszukiwanie zwraca kancelarię Kirkland & Ellis (500 mln USD na własną AI), nie miasto. Nie zweryfikowano.
- **„Strategia Rozwoju Krakowa 2030 zalicza otwarte dane do projektów strategicznych"**: nie znaleziono potwierdzenia. Zostaje tylko to, co mówi zarządzenie 1186/2025.
- **„Zurych hostuje serwery na stronie miasta"**: nieprawda, patrz wyżej (Liip).

## Do zrobienia przed 4.11

- Sprawdzić numer artykułu rozporządzenia 2023/138, który mówi o API.
- Test obciążeniowy `oha` na wdrożonym Workerze i podmiana szacunku kosztu.
- Kontakt zespołu JAK i adres repozytorium do stopki (brak danych w repo).
