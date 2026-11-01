import { z } from "zod";
import { STANY } from "./kontrakt.ts";
const rekord = z.record(z.string(), z.unknown());
const lista = z.array(rekord);
const punkt = z.object({ lat: z.number(), lon: z.number(), nazwa: z.string().optional(), etykieta: z.string().optional(), osm_id: z.number().optional(), osm_typ: z.string().optional(), adres: rekord.optional(), kategoria: z.string().optional() }).passthrough();
const pola: Record<string, Record<string, z.ZodType>> = {
  katalog_szukaj: { liczba: z.number().int(), wyniki: lista, podpowiedz: z.string() },
  zbior_opis: { id: z.string(), pola: z.array(z.string()), jak_pytac: z.string() },
  dane_zapytaj: { zbior: z.string(), wiersze: lista, wiersze_zwrocone: z.number().int(), kompletne: z.boolean() },
  miejsce_szukaj: { kandydaci: z.array(punkt), wymaga_wyboru: z.boolean() },
  osm_obiekty: { obiekty: z.array(punkt), kompletne: z.boolean() },
  operacje_szukaj: { operacje: z.array(z.object({ nazwa: z.string(), opis: z.string(), inputSchema: rekord, outputSchema: rekord }).passthrough()).max(3), razem: z.number().int(), nastepny_offset: z.number().int().nullable() },
  prognoza: { metoda: z.string(), serie: lista, prognoza: lista, ostrzezenia: z.array(z.string()) },
  bdl_dane: { wiersze: lista, jednostka: z.string() },
  bdl_szukaj: { zmienne: lista }, dane_gov: { wyniki: lista },
  przystanki_w_poblizu: { przystanki: lista }, odjazdy: { odjazdy: lista, bledy: z.array(z.unknown()) }, trasa: { opcje: lista },
  planowanie_w_punkcie: { plan: rekord, warstwy: lista, kompletne: z.boolean() },
  wskaznik_dzielnic: { wskaznik: rekord }, dostepnosc: { standardy: rekord, pokrycie: rekord }, obiekty_w_poblizu: { obiekty: lista },
  analiza: { raport: rekord }, dane_eksportuj: { pakiet_danych: rekord }, statystyka: { korelacja: rekord, trend: rekord, opis: rekord },
  widok: { bloki: lista }, parki_geometria: { parki: lista, pokrycie: rekord }, status_zrodel: { worker: rekord, testy: lista },
};
/** Pola są opcjonalne, bo ta sama koperta obejmuje wybór, błąd i strony fragmentów. */
export function schematWyniku(nazwa: string) {
  const ksztalt = Object.fromEntries(Object.entries(pola[nazwa] ?? {}).map(([k,s]) => [k, s.optional()]));
  return z.object({ status: z.enum(STANY), podsumowanie: z.string().optional(), zrodlo: z.string().optional(), komunikat: z.string().optional(),
    _dowod: rekord.optional(), _prezentacja: z.object({ rola: z.enum(["pomocnicza", "koncowa", "wybor", "zatwierdzenie"]) }).optional(), kompletne: z.boolean().optional(), format: z.literal("fragmenty_json").optional(),
    fragmenty: z.array(z.object({ sciezka: z.array(z.union([z.string(), z.number().int()])), wartosc: z.unknown() })).optional(),
    ...ksztalt,
  }).passthrough();
}
