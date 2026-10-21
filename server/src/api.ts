import { limitMinutowy } from "./limit.ts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
const JSON_HDR = { ...CORS, "content-type": "application/json; charset=utf-8" };

export interface OpcjeApi {
  wywolaj: (nazwa: string, argumenty: Record<string, unknown>) => Promise<unknown>;
  ip: string;
  limit?: number;
  // Wstrzykiwany licznik: w Node nie ma `caches`, więc testy podają własny.
  licznik?: (ip: string, limit: number) => Promise<boolean>;
}

const blad = (status: number, komunikat: string, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ blad: komunikat }), { status, headers: { ...JSON_HDR, ...extra } });

export async function obsluzWywolanie(request: Request, { wywolaj, ip, limit = 60, licznik = (i, l) => limitMinutowy("api", i, l) }: OpcjeApi): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return blad(405, "Dozwolona jest tylko metoda POST.");
  if (await licznik(ip, limit)) return blad(429, "Za dużo zapytań z jednego adresu. Spróbuj za minutę.", { "retry-after": "60" });

  let cialo: any;
  try { cialo = await request.json(); } catch { return blad(400, "Treść nie jest poprawnym JSON."); }
  if (!cialo || typeof cialo.nazwa !== "string") return blad(400, "Brakuje pola nazwa.");
  if (cialo.argumenty !== undefined && (typeof cialo.argumenty !== "object" || cialo.argumenty === null || Array.isArray(cialo.argumenty))) {
    return blad(400, "Pole argumenty musi być obiektem.");
  }

  try {
    const wynik = await wywolaj(cialo.nazwa, cialo.argumenty ?? {});
    return new Response(JSON.stringify(wynik), { status: 200, headers: JSON_HDR });
  } catch (e) {
    const tekst = e instanceof Error ? e.message : String(e);
    // Błędy walidacji z wywolaj (zod, nieznana nazwa) to wina klienta, nie źródła.
    if (tekst.startsWith("nieznane narzędzie") || tekst.startsWith("argumenty ")) return blad(400, tekst);
    console.error("api/wywolaj", tekst);
    return blad(502, "Źródło danych nie odpowiedziało. Spróbuj ponownie albo wybierz nagrane pytanie.");
  }
}
