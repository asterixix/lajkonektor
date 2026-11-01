// Teksty strony są w jednym miejscu, żeby dało się sprawdzić ich język i liczby.
// Każda liczba z zewnątrz ma źródło w docs/01-discovery/argumenty-dla-miasta.md.
import { NARZEDZIA } from "./narzedzia.ts";
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
  "niezalezny": "Projekt niezależny. To nie jest serwis Miasta Krakowa.",
  "hero": {
    "naglowek": "Dane Krakowa w Twoim narzędziu AI.",
    "podtytul": "Pytaj, analizuj i sprawdzaj źródła. Lajkonektor łączy miejskie bazy z AI, a decyzje pozostają po Twojej stronie.",
    "cta": "Podłącz do AI",
    "cta2": "Zobacz, jak to działa",
    "demo": "Wypróbuj na żywo",
    "czat": {
      "info": "Jedna rozmowa obejmuje do 5 pytań. Nie wpisuj danych osobowych."
    },
    "zapasowe": [
      "Model pyta. Kod liczy. Kraków podaje źródło.",
      "Asystent AI, który zna Kraków i podaje źródło."
    ]
  },
  "pasek": [
    {
      "liczba": "1203",
      "opis": "zbiorów danych w jednym katalogu"
    },
    {
      "liczba": String(NARZEDZIA.length),
      "opis": "narzędzi i operacji do pytań o miasto"
    },
    {
      "liczba": "6",
      "opis": "źródeł: miasto, GUS, ZTP, OSM"
    },
    {
      "liczba": "Tylko odczyt",
      "opis": "serwer niczego nie zmienia"
    }
  ],
  "jak": {
    "naglowek": "Jak to działa",
    "opis": "Model wybiera narzędzie, a Lajkonektor pyta źródło i wykonuje obliczenia. Ty sprawdzasz dane, metodę i wnioski.",
    "odtworz": "Odtwórz",
    "wstrzymaj": "Wstrzymaj",
    "odNowa": "Od początku",
    "pytanie": "Które dzielnice mają największą powierzchnię parków miejskich?",
    "wywolanie": "katalog_szukaj({ temat: \"parki\" }) → zbior_opis → dane_zapytaj({ id: \"od:OD-SrodowiskoParkiMiejskie/parki-miejskie-powierzchnia\", grupuj_po: [\"Dzielnica\"], agreguj: [{ fn: \"sum\", pole: \"Powierzchnia_ha\" }] })",
    "zrodlo": "Otwarte Dane Krakowa, parki-miejskie-powierzchnia",
    "kroki": [
      {
        "etykieta": "Pytasz",
        "tekst": "Piszesz pytanie po polsku w Claude, ChatGPT lub Perplexity."
      },
      {
        "etykieta": "Model wybiera narzędzie",
        "tekst": "Asystent dobiera narzędzie Lajkonektora i składa jego argumenty."
      },
      {
        "etykieta": "Lajkonektor pyta źródło",
        "tekst": "Serwer odpytuje właściwy system: ZTP, MSIP, GUS, dane.gov.pl albo OSM."
      },
      {
        "etykieta": "Kod liczy",
        "tekst": "Filtry, sumy i czasy liczy kod, nie model. Wynik wraca jako dane."
      },
      {
        "etykieta": "Sprawdzasz wynik",
        "tekst": "Dostajesz odpowiedź lub kartę ze źródłem. Oceniasz datę, kompletność i ograniczenia."
      }
    ]
  },
  "dlaczego": {
    "naglowek": "Mniej szukania. Więcej sprawdzalnych odpowiedzi.",
    "dzis": "Dziś, ręcznie",
    "zLajkonektorem": "Z Lajkonektorem",
    "wiersze": [
      {
        "temat": "Twój czas",
        "dzis": "Osobno szukasz mapy, rejestru i tabeli, a potem łączysz informacje.",
        "zl": "Jedna rozmowa prowadzi do właściwych źródeł i zestawia wynik."
      },
      {
        "temat": "Aktualność",
        "dzis": "Zwykły model może znać tylko informacje z treningu lub przypadkową stronę.",
        "zl": "Narzędzia odczytują źródło i pokazują datę, gdy jest dostępna."
      },
      {
        "temat": "Obliczenia",
        "dzis": "Model może pomylić liczenie lub przepisać niepełną tabelę.",
        "zl": "Filtry i wskaźniki liczy kod. Braki i ograniczenia pozostają widoczne."
      },
      {
        "temat": "Utrzymanie",
        "dzis": "Osobny asystent oznacza kolejną aplikację, integracje i utrzymanie.",
        "zl": "Wspólna warstwa danych może obsłużyć różne narzędzia AI i kolejne zastosowania."
      }
    ],
    "dowody": [
      {
        "liczba": "Wspólny standard",
        "tekst": "MCP oddziela dostęp do danych od aplikacji AI. Raz przygotowana integracja może służyć wielu klientom zgodnym z protokołem.",
        "zrodlo": {
          "tekst": "Architektura MCP",
          "url": "https://modelcontextprotocol.io/docs/learn/architecture"
        }
      },
      {
        "liczba": "Obliczenia w kodzie",
        "tekst": "Serwer pobiera i agreguje dane przed odpowiedzią modelu. Zmniejsza to potrzebę ręcznego przenoszenia tabel i liczenia przez LLM. Wynik nadal wymaga sprawdzenia.",
        "zrodlo": {
          "tekst": "Kontrakt operacji Lajkonektora",
          "url": "https://lajkonektor.sendyka.workers.dev/mcp"
        }
      },
      {
        "liczba": "Rozwój etapami",
        "tekst": "Infrastrukturę rozliczamy według planu i użycia. Zaczynamy od konektorów i pilotażu, bez wymogu trenowania własnego LLM ani budowy centralnego RAG. Całkowity koszt zależy także od modeli, wsparcia i obciążenia.",
        "zrodlo": {
          "tekst": "Cloudflare Workers: rozliczenie użycia",
          "url": "https://developers.cloudflare.com/workers/platform/pricing/"
        }
      }
    ]
  },
  "sesje": {
    "pytania": [
      "Które zbiory zawierają dane o przedszkolach w Krakowie?",
      "Jak dojechać z Łojasiewicza na Basztową?",
      "Jak zmieni się stopa bezrobocia w Krakowie w 2027 i 2028 roku?"
    ]
  },
  "rozkladNarzedzi": {
    "naglowek": "Jedno połączenie. Wiele zastosowań.",
    "opis": "Wyszukiwanie danych, mapa okolicy, transport i analizy korzystają ze wspólnego serwera. Poniżej mechanizm i zabezpieczenia; pełny katalog jest dla zainteresowanych.",
    "reszta": "Zobacz pełny katalog narzędzi i operacji"
  },
  "ograniczenia": {
    "naglowek": "Źródła i ograniczenia",
    "opis": "Dane pochodzą z publicznych rejestrów miasta, GUS, ZTP i OpenStreetMap. Każdy wynik podaje źródło, a braki pokazujemy wprost.",
    "limity": [
      "Źródła mają różne daty i pokrycie. Archiwalna migawka do 24 godzin jest oznaczona i nie udaje danych na żywo.",
      "AI może się pomylić. Prognoza to scenariusz trendu, a informacja o planie miejscowym nie zastępuje dokumentu urzędowego.",
      "Dojazd jest szacunkiem z najwyżej jedną przesiadką. Kolej pokazuje rozkład bez opóźnień.",
      "Prototyp tylko odczytuje dane. Nie wpisuj danych osobowych do czatu."
    ]
  },
  "dlaMiasta": {
    "naglowek": "Miasto bliżej mieszkańca. Dane bliżej decyzji.",
    "opis": "Kraków może rozwijać otwarte dane w kierunku usług AI: od prostych pytań mieszkańca po analizę potrzeb dzielnic. Proponujemy pilotaż z mierzalnym wynikiem, na istniejących systemach.",
    "bloki": [
      {
        "etykieta": "Usługi",
        "naglowek": "Odpowiedź zaczyna się od potrzeby mieszkańca",
        "tekst": "Dojazd, opieka nad dzieckiem czy otoczenie mieszkania stają się pytaniem w rozmowie. Mieszkaniec nie musi znać nazw wydziałów i baz. Pilotaż sprawdzi, które sprawy można wyjaśnić danymi, a które przekazać do właściwej jednostki.",
        "zrodla": [
          {
            "tekst": "Architektura MCP",
            "url": "https://modelcontextprotocol.io/docs/learn/architecture"
          }
        ]
      },
      {
        "etykieta": "Decyzje",
        "naglowek": "Wspólne dane do planowania usług",
        "tekst": "Analityk porównuje usługi w dzielnicach z demografią i opisuje ograniczenia. Urząd otrzymuje zestawienie źródeł i warianty do oceny. Brakujące dane o kolejkach, wykorzystaniu i kosztach wskazują, co uzupełnić przed decyzją budżetową.",
        "zrodla": [
          {
            "tekst": "GUS BDL",
            "url": "https://bdl.stat.gov.pl/"
          }
        ]
      },
      {
        "etykieta": "Koszt",
        "naglowek": "Najpierw mały pilotaż, potem skala",
        "tekst": "Szacunek, nie pomiar. Wspólne konektory ograniczają powielanie integracji; własne AI użytkownika rozlicza jego dostawca. Cel kosztu zmiennego całej typowej odpowiedzi mieszkańca to mniej niż 10 groszy. Celu jeszcze nie potwierdziliśmy pomiarem. Hosting, wdrożenie i utrzymanie liczymy osobno.",
        "zrodla": [
          {
            "tekst": "Cloudflare Workers: rozliczenie użycia",
            "url": "https://developers.cloudflare.com/workers/platform/pricing/"
          }
        ]
      },
      {
        "etykieta": "Niezależność",
        "naglowek": "Jedna warstwa dla różnych narzędzi AI",
        "tekst": "Miasto może rozwijać konektory i udostępniać je różnym klientom zgodnym z MCP. Zmiana aplikacji AI nie musi oznaczać ponownej budowy wszystkich połączeń z danymi. Dostępność funkcji zależy od klienta i jego uprawnień.",
        "zrodla": [
          {
            "tekst": "Architektura MCP",
            "url": "https://modelcontextprotocol.io/docs/learn/architecture"
          }
        ]
      },
      {
        "etykieta": "Kierunek",
        "naglowek": "Kraków jako miejsce eksperymentu",
        "tekst": "To propozycja ambitnego pilotażu miejskiego MCP w Polsce: wspólny dostęp do danych przestrzennych, statystyki i transportu. Chcemy pokazać powtarzalny model dla kolejnych samorządów. Wartość rozwiązania potwierdzą użytkownicy i wyniki pilotażu.",
        "zrodla": [
          {
            "tekst": "Gov.pl: interoperacyjność inteligentnych miast",
            "url": "https://www.gov.pl/web/ia/znaczenie-interoperacyjnosci-w-projektowaniu-inteligentnych-miast--smart-cities"
          }
        ]
      },
      {
        "etykieta": "Pilotaż",
        "naglowek": "Zacznijmy od jednego procesu",
        "tekst": "Wybierzmy jednostkę, grupę użytkowników i pytania. Wspólnie zmierzmy poprawność, czas znalezienia odpowiedzi, wykrywanie błędów i koszt. Na tej podstawie podejmiemy decyzję o rozwoju, zamiast obiecywać oszczędności bez danych.",
        "zrodla": [
          {
            "tekst": "Portal Otwarte Dane Krakowa",
            "url": "https://otwartedane.um.krakow.pl/"
          }
        ]
      }
    ]
  },
  "podlaczenie": {
    "naglowek": "Podłącz swoje AI",
    "kroki": [
      "Skopiuj adres serwera.",
      "Dodaj adres w kliencie obsługującym zdalne serwery MCP.",
      "Zapytaj o Kraków i sprawdź źródło odpowiedzi."
    ],
    "kopiuj": "Kopiuj adres",
    "skopiowano": "Skopiowano",
    "blad": "Nie udało się skopiować. Zaznacz adres i skopiuj go ręcznie.",
    "klienci": [
      {
        "id": "claude",
        "nazwa": "Claude",
        "kroki": [
          "Otwórz Customize, potem Connectors i Add.",
          "Wybierz Custom, następnie Web. Wpisz nazwę Lajkonektor i wklej adres.",
          "Wybierz No sign in, sprawdź zakres dostępu i zatwierdź dodanie.",
          "Włącz konektor w rozmowie. Dostęp zależy od konta i polityki organizacji."
        ]
      },
      {
        "id": "chatgpt",
        "nazwa": "ChatGPT",
        "kroki": [
          "Otwórz Plugins lub Apps, zgodnie z interfejsem i uprawnieniami swojego konta.",
          "Dodaj własny serwer MCP i wklej adres. Dostępność tej opcji zależy od planu i ustawień organizacji.",
          "Wybierz brak uwierzytelniania, bo serwer jest publiczny i tylko czyta.",
          "W nowej rozmowie włącz konektor i zadaj pytanie."
        ]
      },
      {
        "id": "perplexity",
        "nazwa": "Perplexity",
        "kroki": [
          "Otwórz ustawienia konektorów.",
          "Dodaj zdalny serwer MCP i wklej adres.",
          "Wybierz brak uwierzytelniania.",
          "Włącz konektor przy zadawaniu pytania."
        ]
      }
    ],
    "probne": "Pierwsze pytania do wypróbowania"
  },
  "przyszlosc": {
    "naglowek": "Dokąd to zmierza",
    "opis": "Cel jest jeden: szybciej od danych do wniosków. Badacz, urzędnik albo projektant zadaje pytanie, a asystent łączy dane z wielu źródeł i podaje je ze źródłem.",
    "kierunki": [
      {
        "etykieta": "Urzędnicy",
        "naglowek": "Szybsza analiza i reakcja na zmiany",
        "tekst": "Osobny serwer MCP dla pracowników Urzędu, podpięty np. do Microsoft Copilot Studio i do narzędzi, z których urzędnicy korzystają na co dzień. Powtarzalne czynności dałoby się automatyzować, a obsługę skrócić i potanić.",
        "zrodla": [
          {
            "tekst": "Microsoft Learn, MCP w Copilot Studio",
            "url": "https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp"
          }
        ]
      },
      {
        "etykieta": "Projektanci i deweloperzy",
        "naglowek": "Lepsze rozpoznanie warunków inwestycji",
        "tekst": "Plany miejscowe, hałas, jakość powietrza i ruch jako kontekst długoterminowego planowania. Zakres danych, ich daty i przydatność wymagają sprawdzenia dla konkretnego zadania. Integracja z BIM to dalszy kierunek.",
        "zrodla": []
      },
      {
        "etykieta": "Mieszkańcy",
        "naglowek": "Dane w usługach używanych na co dzień",
        "tekst": "Publiczny MCP dla własnego AI mieszkańca oraz możliwa integracja z usługami takimi jak mKraków. Wymaga to badań potrzeb i uzgodnień z właścicielami systemów. Obecny serwer tylko odczytuje dane i nie załatwia spraw urzędowych.",
        "zrodla": []
      },
      {
        "etykieta": "Czat na stronie",
        "naglowek": "Tani czat dla mieszkańców",
        "tekst": "Dobór modelu na podstawie poprawności, kosztu całej odpowiedzi i warunków przetwarzania danych. Cel to mniej niż 10 groszy kosztu zmiennego typowej odpowiedzi mieszkańca. Nie jest to jeszcze potwierdzona cena usługi.",
        "zrodla": []
      }
    ],
    "teza": {
      "naglowek": "Łączymy to, co już jest",
      "tekst": "Zamiast budować od zera osobne środowisko informacyjne pod AI, Lajkonektor spina rozproszone systemy miasta w jedną całość. MCP rozwija się na całym świecie, więc miasto nie zależy od jednego dostawcy. To samo narzędzie podłączy się do Claude, Copilota i ChatGPT, a zakres dopasuje się do potrzeb pracowników."
    }
  },
  "stopka": {
    "opis": "Lajkonektor to konektor otwartych danych Krakowa dla AI. Zespół JAK.",
    "niezalezny": "Projekt niezależny. Nie jest serwisem Miasta Krakowa i nie używa herbu miasta.",
    "zrodla": "Źródła danych",
    "osm": "Dane mapowe: © współtwórcy OpenStreetMap, licencja ODbL.",
    "tlo": "Tło strony: mapa dzielnic Krakowa, autor Slawojar, Wikimedia Commons, licencja CC BY-SA 3.0, zmieniono kolory."
  }
};
