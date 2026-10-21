// Cienkie wrappery na publiczne API miasta. Bez kluczy, tylko odczyt.
import { WERSJA } from "./wersja.ts";
const UA = `lajkonektor/${WERSJA} (konkurs Open Data App Krakow)`;
const TIMEOUT_MS = 25_000;

export const OD_BASE = "https://api.um.krakow.pl";
export const MSIP = "https://msip3.um.krakow.pl/server/rest/services";

// Serwery miasta bywają chwilowo niedostępne (5xx, zerwane połączenia), więc jedno ponowienie po krótkiej przerwie.
async function z_ponowieniem(url: string, init: RequestInit): Promise<Response> {
  for (let proba = 0; ; proba++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status < 500 || proba === 1) return res;
    } catch (e) {
      if (proba === 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function getBytes(url: string): Promise<Uint8Array> {
  const res = await z_ponowieniem(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url.split("?")[0]}`); // bez query: plik_odczyt przyjmuje adresy użytkownika
  return new Uint8Array(await res.arrayBuffer());
}

export async function getJson(url: string): Promise<any> {
  const res = await z_ponowieniem(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url.split("?")[0]}`);
  return res.json();
}

async function postForm(url: string, body: URLSearchParams): Promise<any> {
  const res = await z_ponowieniem(url, {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.json();
}

// ArcGIS zwraca błędy z HTTP 200, więc trzeba sprawdzić pole `error`.
// Długie zapytania (geometria wielu obiektów) idą przez POST, bo limit długości URL jest niski.
export async function arcgisQuery(layerUrl: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ f: "json", ...params });
  const json = qs.toString().length > 1500 ? await postForm(`${layerUrl}/query`, qs) : await getJson(`${layerUrl}/query?${qs}`);
  if (json.error) throw new Error(`ArcGIS: ${json.error.message ?? "błąd"} (${layerUrl.split("/services/")[1]})`);
  return json;
}

export const odGet = (path: string) => getJson(`${OD_BASE}${path}`);

// Metadane i wyniki wyszukiwań zmieniają się rzadko, a każde wywołanie narzędzia
// biło w to samo API. Wzorzec i klucz jak w siec.ts. TTL <= 0 = bez cache,
// czyli wywołania na żywo (odjazdy, trasa, status źródeł) idą tędy.
export async function zCache<T>(klucz: string, ttl_s: number, pobierz: () => Promise<T>): Promise<T> {
  if (ttl_s <= 0) return pobierz();
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null;
  if (!cache) return pobierz();
  // Cały klucz jako jeden segment: encodeURIComponent zabija „..", znaki sterujące
  // i cudze teksty, więc tekst użytkownika nie może trafić w klucz innego zbioru.
  const url = `https://lajkonektor.cache/json/v1/${ttl_s}/${encodeURIComponent(klucz)}`;
  const hit = await cache.match(url);
  if (hit) return (await hit.json()) as T;
  const dane = await pobierz();
  await cache.put(url, new Response(JSON.stringify(dane), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl_s}` } }));
  return dane;
}
