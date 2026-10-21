// Nagrane sesje: odpowiedzi z fixtur testowych, więc odtwarzacz działa bez sieci i bez miejskich API.
import katalog from "../../test/fixtury/katalog.json" with { type: "json" };
import trasa from "../../test/fixtury/trasa.json" with { type: "json" };
import prognozaDane from "../../test/fixtury/prognoza.json" with { type: "json" };
import { TRESC } from "./tresc.ts";

export interface Sesja {
  id: "katalog" | "trasa" | "prognoza";
  pytanie: string;
  narzedzie: string;
  argumenty: Record<string, unknown>;
  wynik: Record<string, any>;
}

export const SESJE: Sesja[] = [
  { id: "katalog", pytanie: TRESC.odtwarzacz.pytania[0], narzedzie: "katalog_szukaj", argumenty: { temat: "przedszkola", limit: 6 }, wynik: katalog as Record<string, any> },
  { id: "trasa", pytanie: TRESC.odtwarzacz.pytania[1], narzedzie: "trasa", argumenty: { z: { ulica: "Łojasiewicza", numer: "4" }, do: { ulica: "Basztowa", numer: "20" }, max_dojscie_m: 800 }, wynik: trasa as Record<string, any> },
  { id: "prognoza", pytanie: TRESC.odtwarzacz.pytania[2], narzedzie: "prognoza", argumenty: { serie: prognozaDane._zapytanie.serie, horyzont: 3, metoda: "auto", etykieta: prognozaDane._zapytanie.etykieta }, wynik: prognozaDane as Record<string, any> },
];
