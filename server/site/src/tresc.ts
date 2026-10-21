// Teksty strony są w jednym miejscu, żeby dało się sprawdzić ich język i liczby.
// Każda liczba z zewnątrz ma źródło w docs/01-discovery/argumenty-dla-miasta.md.
export const ZAKAZANE = [
  "innowacyjn", "kompleksow", "rewolucyj", "unikaln", "przełomow", "synergi",
  "leverage", "robust", "empower", "streamline", "utilize", "delve", "foster", "facilitate",
  "wykorzystuj", "usprawni", "zaawansowan",
];

export function policzSlowa(tekst: string): number {
  return tekst.trim().split(/\s+/).filter(Boolean).length;
}

export interface Zrodlo { tekst: string; url: string }
export interface Kafel { pytanie: string; korzysc: string; narzedzie: string; pytanieAi: string }

export const TRESC = {
  niezalezny: "Projekt niezależny. To nie jest serwis Miasta Krakowa.",
  hero: {
    naglowek: "Zapytaj AI o Kraków. Dostaniesz liczby ze źródłem.",
    podtytul: "Odjazdy, szkoły, parki i statystyki miasta w jednej rozmowie z AI. Każda odpowiedź podaje źródło.",
    cta: "Podłącz do AI",
    cta2: "Zobacz, jak to działa",
    demo: "Wypróbuj na żywo",
    czat: {
      info: "Pytania trafiają do modelu Claude Haiku 5.5 przez Eden AI. Nie wpisuj danych osobowych.",
      przyklady: [
        "Kiedy najbliższy tramwaj spod Teatru Słowackiego?",
        "Jak dojechać z AGH na Rynek Główny?",
        "Które zbiory mają dane o przedszkolach i co zawierają?",
        "Jak zmieniała się stopa bezrobocia w Krakowie i co z prognozą?",
      ],
    },
    zapasowe: [
      "Model pyta. Kod liczy. Kraków podaje źródło.",
      "Asystent AI, który zna Kraków i podaje źródło.",
    ],
  },
  pasek: [
    { liczba: "1203", opis: "zbiorów danych w jednym katalogu" },
    { liczba: "16", opis: "narzędzi do pytań o miasto" },
    { liczba: "6", opis: "źródeł: miasto, GUS, ZTP, OSM" },
    { liczba: "Tylko odczyt", opis: "serwer niczego nie zmienia" },
  ],
  jak: {
    naglowek: "Jak to działa",
    opis: "Model nie zgaduje liczb. Wybiera narzędzie, a Lajkonektor pyta źródło i zwraca wynik razem z jego adresem.",
    odtworz: "Odtwórz",
    wstrzymaj: "Wstrzymaj",
    odNowa: "Od początku",
    przyklad: "Przykład z nagranego wywołania narzędzia odjazdy.",
    pytanie: "Kiedy najbliższy tramwaj spod Teatru Słowackiego?",
    wywolanie: 'odjazdy({ nazwa: "Teatr Słowackiego" })',
    zrodlo: "ZTP Kraków, GTFS-RT (na żywo)",
    kroki: [
      { etykieta: "Pytasz", tekst: "Piszesz pytanie po polsku w Claude, ChatGPT lub Perplexity." },
      { etykieta: "Model wybiera narzędzie", tekst: "Asystent dobiera narzędzie Lajkonektora i składa jego argumenty." },
      { etykieta: "Lajkonektor pyta źródło", tekst: "Serwer odpytuje właściwy system: ZTP, MSIP, GUS, dane.gov.pl albo OSM." },
      { etykieta: "Kod liczy", tekst: "Filtry, sumy i czasy liczy kod, nie model. Wynik wraca jako dane." },
      { etykieta: "Odpowiedź ze źródłem", tekst: "Dostajesz zdanie albo kartę z mapą, tabelą lub wykresem i adresem źródła." },
    ],
  },
  mieszkancy: {
    naglowek: "Co zyskujesz jako mieszkaniec",
    opis: "Co trzeci dorosły Polak pyta już generatywną AI (CBOS, maj 2026). Z Lajkonektorem jej odpowiedź o Krakowie opiera się na danych miasta, nie na pamięci modelu.",
    zrodlo: { tekst: "CBOS, Korzystanie ze sztucznej inteligencji, K 064/26", url: "https://www.cbos.pl/SPISKOM.POL/2026/K_064_26.PDF" } as Zrodlo,
    sprawdz: "Zapytaj AI",
    kafle: [
      { pytanie: "Kiedy przyjedzie mój tramwaj?", korzysc: "Odjazdy z feedu ZTP razem z komunikatami o utrudnieniach. Bez szukania rozkładu.", narzedzie: "odjazdy", pytanieAi: "Kiedy najbliższy tramwaj spod Teatru Słowackiego?" },
      { pytanie: "Jak dojadę z domu do pracy?", korzysc: "Połączenie z jedną przesiadką, dojście pieszo i oczekiwanie w minutach.", narzedzie: "trasa", pytanieAi: "Jak dojechać komunikacją miejską z AGH na Rynek Główny?" },
      { pytanie: "Co mam w okolicy?", korzysc: "Przystanki w promieniu spaceru, z czasem dojścia po prawdziwych chodnikach.", narzedzie: "przystanki_w_poblizu", pytanieAi: "Jakie przystanki są w promieniu 500 metrów od Rynku Głównego i ile idzie się do nich pieszo?" },
      { pytanie: "Czy miasto publikuje dane o przedszkolach?", korzysc: "Katalog pokazuje, które zbiory istnieją, jakie mają kolumny i kto je prowadzi.", narzedzie: "katalog_szukaj", pytanieAi: "Które zbiory mają dane o przedszkolach w Krakowie i co zawierają?" },
      { pytanie: "Co zmienia się w mojej okolicy?", korzysc: "Plany miejscowe, pozwolenia na budowę i hałas w jednym miejscu, także dla wybranego punktu na mapie.", narzedzie: "dane_zapytaj", pytanieAi: "Jakie dane o planach miejscowych i pozwoleniach na budowę ma Kraków?" },
      { pytanie: "Dokąd zmierza bezrobocie w Krakowie?", korzysc: "Szereg GUS z prognozą na kolejne lata, z przedziałami niepewności i oceną modelu.", narzedzie: "prognoza", pytanieAi: "Jak zmieniała się stopa bezrobocia w Krakowie i jaka jest prognoza na następne lata?" },
    ] as Kafel[],
  },
  dlaczego: {
    naglowek: "Dlaczego to działa lepiej",
    dzis: "Dziś, ręcznie",
    zLajkonektorem: "Z Lajkonektorem",
    wiersze: [
      { temat: "Gdzie szukać", dzis: "W sześciu miejscach: Otwarte Dane UMK, MSIP, GUS BDL, dane.gov.pl, rozkład ZTP i OpenStreetMap.", zl: "Zadajesz jedno pytanie. Asystent sam wybiera źródło." },
      { temat: "Format", dzis: "Pliki CSV i XLSX, warstwy mapowe i API o różnych zasadach.", zl: "Zdanie, tabela, wykres albo mapa." },
      { temat: "Liczenie", dzis: "Własny arkusz, filtry i sumy w głowie.", zl: "Filtry, sumy i średnie liczy kod serwera." },
      { temat: "Zaufanie", dzis: "Sam sprawdzasz, skąd pochodzi liczba.", zl: "Źródło stoi przy każdej odpowiedzi." },
    ],
    dowody: [
      { liczba: "0% → 95%", tekst: "Bez dostępu do danych ChatGPT i Gemini odpowiedziały poprawnie na 0% pytań o wydatki rządu USA i 2,1% o dane zdrowotne. Z serwerami MCP wynik wyniósł 95%. To pilotaż na małej próbie.", zrodlo: { tekst: "U.S. Digital Corps, maj 2026", url: "https://digitalcorps.gsa.gov/pdfs/MCP_Report.pdf" } as Zrodlo },
      { liczba: "36%", tekst: "dorosłych Polaków korzystało z generatywnej AI w ciągu trzech miesięcy przed majem 2026. Wśród osób w wieku 18 do 24 lat 81%, wśród seniorów 8%. Strona nie zastępuje urzędu ani infolinii.", zrodlo: { tekst: "CBOS, K 064/26", url: "https://www.cbos.pl/SPISKOM.POL/2026/K_064_26.PDF" } as Zrodlo },
      { liczba: "Prawie 100%", tekst: "Gdy modelowi podano gotową odpowiedź z API, odpowiadał poprawnie niemal zawsze. Trudne jest pobranie danych, więc robi to serwer, a model układa odpowiedź.", zrodlo: { tekst: "U.S. Digital Corps, maj 2026", url: "https://digitalcorps.gsa.gov/pdfs/MCP_Report.pdf" } as Zrodlo },
    ],
  },
  // Pytania nagranych sesji (sesje.ts): zapasowe odpowiedzi i etykiety kart.
  sesje: {
    pytania: [
      "Które zbiory zawierają dane o przedszkolach w Krakowie?",
      "Jak dojechać z Łojasiewicza na Basztową?",
      "Jak zmieni się stopa bezrobocia w Krakowie w 2027 i 2028 roku?",
    ],
  },
  rozkladNarzedzi: {
    naglowek: "Szesnaście narzędzi do danych miasta",
    opis: "Osiem głównych poniżej, reszta pod spodem. Wszystkie tylko czytają dane i podają źródło.",
    reszta: "Pokaż pozostałe narzędzia",
  },
  ograniczenia: {
    naglowek: "Ograniczenia na etapie prototypu",
    opis: "Lajkonektor jest prototypem na konkurs. Poniżej to, co dziś nie działa albo działa tylko częściowo. Wolimy to pokazać, niż ukryć.",
    przyklad: "Przykład niepewności: prognoza stopy bezrobocia z przedziałami 80% i 95%.",
    limity: [
      "Model AI może się mylić. Liczby i źródło sprawdzaj w karcie pod odpowiedzią.",
      "Czat wysyła pytanie do modelu Claude Haiku 5.5 przez Eden AI. Nie wpisuj w nim danych osobowych.",
      "Serwer tylko czyta dane publiczne. Nie składa spraw i nie loguje użytkowników.",
      "Pociągi mają godziny z rozkładu PKP PLK, bez opóźnień.",
      "Czasy tras to szacunki: oczekiwanie z częstotliwości kursów, jazda z mediany rozkładu, najwyżej jedna przesiadka. W nocy wyniki bywają mało realistyczne.",
      "Kontury parków z OpenStreetMap mamy dla 46 z 78 parków, czyli dla 44,9% powierzchni.",
      "Brak danych w katalogu o odpadach i PSZOK, kinach, targowiskach i wypadkach drogowych.",
      "Dane są tak aktualne, jak ich publikacja. Datę stanu pokazujemy, gdy źródło ją podaje, a gdy serwer miasta nie odpowiada, narzędzie zwraca błąd.",
      "Nie robiliśmy testu obciążeniowego. Koszt hostingu to szacunek, a limity zapytań są przybliżone, bo nie mamy własnej domeny z regułami WAF.",
    ],
  },
  dlaMiasta: {
    naglowek: "Dla miasta",
    opis: "Argumenty dla Urzędu i jury. Przy każdym stoi źródło, a to, czego nie sprawdziliśmy, jest oznaczone.",
    bloki: [
      {
        etykieta: "Koszt",
        naglowek: "Jeden Worker zamiast osobnego czatu",
        tekst: "Szacunek, nie pomiar. Według cennika Cloudflare Workers przy 30 ms CPU na wywołanie 100 tys. zapytań dziennie to ok. 6 USD miesięcznie, a 200 tys. ok. 8 USD. Menlo Park płaci 9 900 USD rocznie za czat WWW, to inny produkt, ale ta sama skala wydatków.",
        zrodla: [{ tekst: "Cloudflare Workers, cennik", url: "https://developers.cloudflare.com/workers/platform/pricing" }, { tekst: "The Almanac, 17.08.2026", url: "https://www.almanacnews.com/city-government/2026/08/17/menlo-park-launches-laurel-an-ai-chatbot-to-help-navigate-city-services" }] as Zrodlo[],
      },
      {
        etykieta: "Utrzymanie",
        naglowek: "Jeden adres dla wielu asystentów",
        tekst: "Standard MCP stworzył Anthropic, a obsługują go Claude, ChatGPT, Gemini i Copilot. Miasto utrzymuje jeden serwer zamiast osobnej integracji dla każdego producenta. Dostępność konektorów zależy od klienta i planu użytkownika.",
        zrodla: [{ tekst: "FedScoop, 2026", url: "https://fedscoop.com/federal-goverment-mcp-improve-ai-access-public-data" }] as Zrodlo[],
      },
      {
        etykieta: "Świat",
        naglowek: "Inne miasta już podłączają dane do AI",
        tekst: "Boston buduje serwer MCP nad otwartymi danymi miasta, bo modele bez niego odpowiadają z treningu albo zmyślają. Dla Zurychu działa serwer MCP nad ponad 900 zbiorami, prowadzony przez firmę Liip.",
        zrodla: [{ tekst: "Boston, Open Context", url: "https://rebootdemocracy.ai/blog/boston-agentic-middleware" }] as Zrodlo[],
      },
      {
        etykieta: "Kraków",
        naglowek: "Portal Otwarte Dane już rośnie",
        tekst: "Portal ruszył w kwietniu 2024 roku z 27 zbiorami, a w marcu 2026 miasto podawało ok. 140 zasobów. Lajkonektor łączy je z MSIP, GUS, ZTP i OpenStreetMap w katalogu 1203 pozycji.",
        zrodla: [{ tekst: "krakow.pl, 3.03.2026", url: "https://krakow.pl/aktualnosci/311667,29,komunikat,odkryj_krakow_w_liczbach__zajrzyj_na_portal_otwarte_dane.html" }] as Zrodlo[],
      },
      {
        etykieta: "Prawo",
        naglowek: "UE chce danych do odczytu maszynowego",
        tekst: "Rozporządzenie 2023/138 wskazuje zbiory o wysokiej wartości, m.in. dane o mobilności, geoprzestrzenne i statystyczne. Organy publiczne udostępniają je w formie, którą programy odczytają przez API.",
        zrodla: [{ tekst: "EUR-Lex, rozporządzenie 2023/138", url: "https://eur-lex.europa.eu/eli/reg_impl/2023/138/oj" }] as Zrodlo[],
      },
      {
        etykieta: "Etap",
        naglowek: "Najpierw dane, potem asystent",
        tekst: "Zarządzenie 1186/2025 daje Głównemu Miejskiemu Strategowi ds. Informatyzacji portfel Smart City z AI i opiniowanie rozwiązań pod kątem kosztu. Lajkonektor to tani pierwszy etap: warstwa danych, na której można zbudować asystenta.",
        zrodla: [{ tekst: "Zarządzenie 1186/2025, § 3", url: "https://bip.krakow.pl/zarzadzenia/2025/1186/X19BS19fOTI2MDg=/1186_2025.pdf" }] as Zrodlo[],
      },
    ],
  },
  podlaczenie: {
    naglowek: "Podłącz w trzech krokach",
    kroki: [
      "Skopiuj adres serwera.",
      "Dodaj adres w kliencie obsługującym zdalne serwery MCP.",
      "Zapytaj o Kraków i sprawdź źródło odpowiedzi.",
    ],
    kopiuj: "Kopiuj adres",
    skopiowano: "Skopiowano",
    blad: "Nie udało się skopiować. Zaznacz adres i skopiuj go ręcznie.",
    klienci: [
      { id: "claude", nazwa: "Claude", kroki: [
        "Otwórz Ustawienia, a potem Konektory.",
        "Wybierz dodanie własnego konektora.",
        "Wpisz nazwę Lajkonektor i wklej adres serwera. Pola logowania zostaw puste.",
        "W nowej rozmowie włącz konektor i zadaj pytanie.",
      ] },
      { id: "chatgpt", nazwa: "ChatGPT", kroki: [
        "Otwórz ustawienia konektorów. W części planów trzeba włączyć tryb dla deweloperów.",
        "Dodaj własny konektor MCP i wklej adres serwera.",
        "Wybierz brak uwierzytelniania, bo serwer jest publiczny i tylko czyta.",
        "W nowej rozmowie włącz konektor i zadaj pytanie.",
      ] },
      { id: "perplexity", nazwa: "Perplexity", kroki: [
        "Otwórz ustawienia konektorów.",
        "Dodaj zdalny serwer MCP i wklej adres.",
        "Wybierz brak uwierzytelniania.",
        "Włącz konektor przy zadawaniu pytania.",
      ] },
    ],
    probne: "Pierwsze pytania do wypróbowania",
    pytania: [
      "Jakie dane ma Kraków o hałasie? Pokaż pięć zbiorów.",
      "Kiedy najbliższy tramwaj spod Teatru Słowackiego?",
      "Jak zmieniała się stopa bezrobocia w Krakowie w latach 2019 do 2025?",
      "Jak dojechać z AGH na Rynek Główny?",
    ],
  },
  przyszlosc: {
    naglowek: "Dokąd to zmierza",
    opis: "Cel jest jeden: szybciej od danych do wniosków. Badacz, urzędnik albo projektant zadaje pytanie, a asystent łączy dane z wielu źródeł i podaje je ze źródłem. Poniżej kierunki rozwoju. To plany, nie gotowe funkcje.",
    plan: "Kierunek, nie obietnica",
    kierunki: [
      {
        etykieta: "Urzędnicy",
        naglowek: "Szybsza analiza i reakcja na zmiany",
        tekst: "Osobny serwer MCP dla pracowników Urzędu, podpięty np. do Microsoft Copilot Studio i do narzędzi, z których urzędnicy korzystają na co dzień. Powtarzalne czynności dałoby się automatyzować, a obsługę skrócić i potanić.",
        zrodla: [{ tekst: "Microsoft Learn, MCP w Copilot Studio", url: "https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp" }] as Zrodlo[],
      },
      {
        etykieta: "Projektanci i deweloperzy",
        naglowek: "Dane MSIP prosto do modeli BIM",
        tekst: "Dane z MSIP o planach, działkach i infrastrukturze mogłyby trafiać do modeli BIM bez ręcznego pobierania. To szybsze i lepiej udokumentowane planowanie przestrzenne.",
        zrodla: [] as Zrodlo[],
      },
      {
        etykieta: "Mieszkańcy",
        naglowek: "Od odpowiedzi do załatwionej sprawy",
        tekst: "Kolejne narzędzia: zgłoszenia i uwagi, sprawy dla Straży Miejskiej, podania, ważność Karty Krakowskiej i biletów, wywóz odpadów, dostępność urzędów i prostszy kontakt z nimi. To wymaga logowania i zgody właścicieli tych systemów.",
        zrodla: [] as Zrodlo[],
      },
      {
        etykieta: "Czat na stronie",
        naglowek: "Tani czat dla mieszkańców",
        tekst: "Prosty czat z otwartym modelem, np. Gemma 4 na licencji Apache 2.0, który tylko rozumie pytanie. Resztę pracy robi serwer MCP, więc koszt modelu zostaje mały.",
        zrodla: [{ tekst: "Mashable, Gemma 4", url: "https://mashable.com/article/google-releases-gemma-4-open-ai-model-now-open-source-how-to-try-it" }] as Zrodlo[],
      },
    ],
    teza: {
      naglowek: "Łączymy to, co już jest",
      tekst: "Zamiast budować od zera osobne środowisko informacyjne pod AI, Lajkonektor spina rozproszone systemy miasta w jedną całość. MCP rozwija się na całym świecie, więc miasto nie zależy od jednego dostawcy. To samo narzędzie podłączy się do Claude, Copilota i ChatGPT, a zakres dopasuje się do potrzeb pracowników.",
    },
    uwaga: "Dziś serwer czyta tylko dane publiczne. Każde rozszerzenie wymaga oceny bezpieczeństwa i zgody właścicieli systemów.",
  },
  stopka: {
    opis: "Lajkonektor to konektor otwartych danych Krakowa dla AI. Zespół JAK.",
    niezalezny: "Projekt niezależny. Nie jest serwisem Miasta Krakowa i nie używa herbu miasta.",
    zrodla: "Źródła danych",
    osm: "Dane mapowe: © współtwórcy OpenStreetMap, licencja ODbL.",
  },
};
