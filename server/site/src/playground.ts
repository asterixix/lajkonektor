// Plac zabaw w hero: deterministyczne wywołania narzędzi bez modelu. Fixtury służą jako zapas, gdy API nie odpowiada.
import katalog from "../../test/fixtury/katalog.json" with { type: "json" };
import odjazdy from "../../test/fixtury/odjazdy.json" with { type: "json" };
import trasa from "../../test/fixtury/trasa.json" with { type: "json" };
import przystanki from "../../test/fixtury/przystanki.json" with { type: "json" };

export type Wartosci = Record<string, string>;

export interface Pole { klucz: string; etykieta: string }

export interface Zakladka {
  id: "katalog" | "odjazdy" | "trasa" | "przystanki";
  etykieta: string;
  narzedzie: string;
  pola: Pole[];
  przyklady: Wartosci[];
  zapas: Record<string, any>;
  args: (w: Wartosci) => Record<string, unknown>;
}

const nazwa = (w: Wartosci, k: string) => (w[k] ?? "").trim();

export const ZAKLADKI: Zakladka[] = [
  {
    id: "katalog", etykieta: "Szukaj zbiorów", narzedzie: "katalog_szukaj",
    pola: [{ klucz: "temat", etykieta: "Temat, np. przedszkola" }],
    przyklady: [{ temat: "przedszkola" }, { temat: "hałas" }, { temat: "parki" }],
    zapas: katalog,
    args: (w) => ({ temat: nazwa(w, "temat"), limit: 6 }),
  },
  {
    id: "odjazdy", etykieta: "Odjazdy", narzedzie: "odjazdy",
    pola: [{ klucz: "nazwa", etykieta: "Przystanek, np. Teatr Słowackiego" }],
    przyklady: [{ nazwa: "Teatr Słowackiego" }, { nazwa: "Dworzec Główny" }, { nazwa: "Rondo Mogilskie" }],
    zapas: odjazdy,
    args: (w) => ({ nazwa: nazwa(w, "nazwa"), limit: 8 }),
  },
  {
    id: "trasa", etykieta: "Trasa", narzedzie: "trasa",
    pola: [{ klucz: "z", etykieta: "Skąd" }, { klucz: "do", etykieta: "Dokąd" }],
    przyklady: [{ z: "AGH", do: "Rynek Główny" }, { z: "Dworzec Główny", do: "Rynek Główny" }],
    zapas: trasa,
    args: (w) => ({ z: { tekst: nazwa(w, "z") }, do: { tekst: nazwa(w, "do") }, max_dojscie_m: 800 }),
  },
  {
    id: "przystanki", etykieta: "Przystanki", narzedzie: "przystanki_w_poblizu",
    pola: [{ klucz: "miejsce", etykieta: "Miejsce lub adres" }],
    przyklady: [{ miejsce: "Rynek Główny" }, { miejsce: "AGH" }],
    zapas: przystanki,
    args: (w) => ({ miejsce: { tekst: nazwa(w, "miejsce") }, promien_m: 500, limit: 6 }),
  },
];

// Pola puste albo krótsze niż 2 znaki odrzuca schemat serwera, więc łapiemy to przed wysłaniem.
export function brakujacePole(z: Zakladka, w: Wartosci): Pole | null {
  return z.pola.find((p) => nazwa(w, p.klucz).length < 2) ?? null;
}

// Wywołanie w postaci, jaką zobaczyłby model: nazwa({ argumenty }).
export function podpisWywolania(z: Zakladka, w: Wartosci): string {
  return `${z.narzedzie}(${JSON.stringify(z.args(w))})`;
}
