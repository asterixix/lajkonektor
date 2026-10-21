// Teksty strony są w jednym miejscu, żeby dało się sprawdzić ich język i liczby.
export const ZAKAZANE = [
  "innowacyjn", "kompleksow", "rewolucyj", "unikaln", "przełomow", "synergi",
  "leverage", "robust", "empower", "streamline", "utilize", "delve", "foster", "facilitate",
  "wykorzystuj", "usprawni", "zaawansowan",
];

export function policzSlowa(tekst: string): number {
  return tekst.trim().split(/\s+/).filter(Boolean).length;
}

export const TRESC = {
  hero: {
    naglowek: "Zapytaj AI o Kraków. Dostaniesz liczby ze źródłem.",
    podtytul: "Lajkonektor podłącza dane Krakowa do asystentów AI. Przy wynikach zobaczysz źródło i dostępne informacje o aktualności.",
    cta: "Podłącz do AI",
    zapasowe: [
      "Model pyta. Kod liczy. Kraków podaje źródło.",
      "Asystent AI, który zna Kraków i podaje źródło.",
    ],
  },
  odtwarzacz: {
    naglowek: "Zobacz, jak to działa",
    pytania: [
      "Które zbiory zawierają dane o przedszkolach w Krakowie?",
      "Jak dojechać z Łojasiewicza na Basztową?",
      "Jak zmieni się stopa bezrobocia w Krakowie w 2027 i 2028 roku?",
    ],
  },
  rozkladNarzedzi: {
    naglowek: "Osiem narzędzi do danych miasta",
    opis: "Sprawdź zbiory, zaplanuj trasę lub odczytaj odjazdy. Przy wynikach pokazujemy źródło danych.",
  },
  czegoNieWiemy: {
    naglowek: "Czego nie wiemy",
    opis: "Projekcja stopy bezrobocia opiera się na danych GUS do 2025 roku. Błąd testu wstecznego wyniósł 14,8%. Wykres pokazuje przedziały niepewności.",
  },
  dlaMiasta: {
    naglowek: "Dla miasta",
    bloki: [
      {
        etykieta: "Dokładność",
        naglowek: "Model potrzebuje dostępu do danych",
        tekst: "W teście GSA ChatGPT poprawnie odczytał 5% odpowiedzi z federalnych danych USA, Gemini 0%. Po podłączeniu serwerów MCP modele uzyskały łącznie 95%. Lajkonektor podaje asystentowi dane Krakowa wraz ze źródłem.",
      },
      {
        etykieta: "Utrzymanie",
        naglowek: "Jeden adres dla wielu asystentów",
        tekst: "Mieszkaniec może dodać zdalny serwer MCP do obsługiwanego przez siebie asystenta, w tym Claude lub ChatGPT. Miasto utrzymuje jeden serwer zamiast osobnej integracji dla każdego producenta. Dostępność konektorów zależy od klienta i planu użytkownika.",
      },
      {
        etykieta: "Koszt",
        naglowek: "Ile może kosztować sam Worker",
        tekst: "Szacunek, nie pomiar. Według cennika Cloudflare Workers przy 30 ms CPU na wywołanie 100 tys. zapytań dziennie to ok. 6 USD miesięcznie, a 200 tys. ok. 8 USD. Wyliczenie obejmuje Workera, nie pracę nad danymi ani koszt usług zewnętrznych. Sprawdzimy je testem obciążeniowym.",
      },
      {
        etykieta: "Świat",
        naglowek: "Miasta już podłączają dane do AI",
        tekst: "Seul uruchomił serwer MCP z danymi publicznymi w 2026 roku. Boston zaczął od otwartych danych. Zurych udostępnia serwery obejmujące ponad 900 zbiorów, a Toronto postawiło swój na Cloudflare Workers.",
      },
      {
        etykieta: "Strategia",
        naglowek: "Kraków rozwija już otwarte dane",
        tekst: "Portal Otwartych Danych działa od kwietnia 2024 roku. Miasto zalicza otwarte dane do projektów Strategii Rozwoju Krakowa 2030. Zarządzenie 1186/2025 wskazuje AI w usługach publicznych jako część prac nad Smart City.",
      },
      {
        etykieta: "Etap",
        naglowek: "Najpierw dane, potem asystent",
        tekst: "Miasto może sprawdzić jakość źródeł i zainteresowanie danymi, zanim zbuduje własnego asystenta dla mieszkańców. Narzędzia Lajkonektora odczytują publiczne dane i nie zmieniają ich.",
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
  },
  stopka: "Źródła: Otwarte Dane UMK, MSIP, GUS BDL, dane.gov.pl, ZTP GTFS-RT i OpenStreetMap. Zespół JAK.",
};
