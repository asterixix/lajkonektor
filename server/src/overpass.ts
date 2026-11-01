import { zCache } from "./sources.ts";
import { WERSJA } from "./wersja.ts";
import { runtime } from "./runtime.ts";
import { BladDomeny } from "./bledy.ts";
export const KATEGORIE_OSM = {
  akademiki: '["building"="dormitory"]', uczelnie: '["amenity"="university"]', biblioteki: '["amenity"="library"]',
  apteki: '["amenity"="pharmacy"]', szkoly: '["amenity"="school"]', przedszkola: '["amenity"="kindergarten"]',
  parki: '["leisure"="park"]', przystanki: '["public_transport"="platform"]', toalety: '["amenity"="toilets"]', wodopoje: '["amenity"="drinking_water"]',
} as const;
// Publiczne instancje bywają przeciążone, więc krótki termin na każdą i kolejne serwery zamiast jednego długiego czekania.
// Do serwerów trafia tylko kategoria i okolica punktu (bez danych użytkownika).
const SERWERY = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://lz4.overpass-api.de/api/interpreter"];
const TERMIN_S = 8;
async function overpass(q: string): Promise<any> {
  const sygnal = runtime.getStore()?.sygnal;
  sygnal?.throwIfAborted();
  // Wszystkie serwery równolegle: wygrywa pierwsza poprawna odpowiedź, a martwy serwer nie opóźnia reszty (kolejne próby sumowały terminy).
  const zapytaj = async (serwer: string) => {
    const timeout = AbortSignal.timeout((TERMIN_S + 2) * 1000);
    const res = await fetch(`${serwer}?${new URLSearchParams({ data: q })}`, { headers: { "user-agent": `lajkonektor/${WERSJA} (+https://lajkonektor.sendyka.workers.dev)` }, signal: sygnal ? AbortSignal.any([sygnal, timeout]) : timeout });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j: any = await res.json();
    if (j.remark || !Array.isArray(j.elements)) throw new Error("niepełna odpowiedź");
    return j;
  };
  try { return await Promise.any(SERWERY.map(zapytaj)); }
  catch (e) {
    if (sygnal?.aborted) throw e;
    throw new BladDomeny("niedostepne", "Overpass (OSM) nie odpowiedział na żadnym serwerze. Spróbuj ponownie za chwilę.");
  }
}
export async function osmObiekty(a: { kategoria: keyof typeof KATEGORIE_OSM; lat: number; lon: number; promien_m: number; limit: number }) {
  if (!Object.hasOwn(KATEGORIE_OSM, a.kategoria) || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || a.lat < 49.2 || a.lat > 50.5 || a.lon < 18.9 || a.lon > 21.5 || !Number.isInteger(a.promien_m) || a.promien_m < 1 || a.promien_m > 5000 || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 100) throw new BladDomeny("wejscie", "Niepoprawna kategoria, promień, limit lub obszar OSM.");
  const r = await zCache(`overpass:${JSON.stringify(a)}`, 3600, async () => {
    const q = `[out:json][timeout:${TERMIN_S}];nwr${KATEGORIE_OSM[a.kategoria]}(around:${a.promien_m},${a.lat},${a.lon});out center tags ${a.limit + 1};`;
    return overpass(q);
  });
  runtime.getStore()?.sygnal?.throwIfAborted();
  if (r.remark || !Array.isArray(r.elements)) throw new BladDomeny("niedostepne", "Overpass nie zwrócił pełnej odpowiedzi.");
  return { zrodlo: "© OpenStreetMap contributors, ODbL; Overpass", data_stanu: r.osm3s?.timestamp_osm_base ?? null, kompletne: r.elements.length <= a.limit,
    uwagi: ["Brak obiektu w OSM nie dowodzi braku usługi. Kategorie i pokrycie zależą od społeczności OSM."],
    obiekty: r.elements.slice(0, a.limit).map((x: any) => ({ osm_id: x.id, osm_typ: x.type, nazwa: x.tags?.name ?? a.kategoria, lat: x.lat ?? x.center?.lat, lon: x.lon ?? x.center?.lon, adres: Object.fromEntries(Object.entries(x.tags ?? {}).filter(([k]) => k.startsWith("addr:"))), kategoria: a.kategoria })) };
}
