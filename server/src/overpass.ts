import dane from "../data/osm-obiekty.json" with { type: "json" };
import { BladDomeny } from "./bledy.ts";
import { odleglosc } from "./transport.ts";
// Tagi kategorii; musi odpowiadać KATEGORIE w scripts/build-osm-obiekty.py.
export const KATEGORIE_OSM = {
  akademiki: '["building"="dormitory"]', uczelnie: '["amenity"="university"]', biblioteki: '["amenity"="library"]',
  apteki: '["amenity"="pharmacy"]', szkoly: '["amenity"="school"]', przedszkola: '["amenity"="kindergarten"]',
  parki: '["leisure"="park"]', przystanki: '["public_transport"="platform"]', toalety: '["amenity"="toilets"]', wodopoje: '["amenity"="drinking_water"]',
} as const;
// Publiczny overpass-api.de od 11.2026 nie obsługuje użycia automatycznego, a pozostałe instancje są niestabilne,
// dlatego obiekty pochodzą z migawki ekstraktu Geofabrik (scripts/build-osm-obiekty.py), z jawną datą stanu.
type Wiersz = [string, number, number, number, string | null, Record<string, string> | null];
const TYP: Record<string, string> = { n: "node", w: "way", r: "relation" };
const [ZACHOD, POLUDNIE, WSCHOD, POLNOC] = dane.bbox;

export function osmObiekty(a: { kategoria: keyof typeof KATEGORIE_OSM; lat: number; lon: number; promien_m: number; limit: number }) {
  if (!Object.hasOwn(KATEGORIE_OSM, a.kategoria) || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || a.lat < 49.2 || a.lat > 50.5 || a.lon < 18.9 || a.lon > 21.5 || !Number.isInteger(a.promien_m) || a.promien_m < 1 || a.promien_m > 5000 || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 100) throw new BladDomeny("wejscie", "Niepoprawna kategoria, promień, limit lub obszar OSM.");
  const dLat = a.promien_m / 110_540, dLon = a.promien_m / (111_320 * Math.cos(a.lat * Math.PI / 180));
  const wMigawce = a.lat - dLat >= POLUDNIE && a.lat + dLat <= POLNOC && a.lon - dLon >= ZACHOD && a.lon + dLon <= WSCHOD;
  const trafione = (dane.kategorie[a.kategoria] as Wiersz[])
    .map((o) => ({ o, d: odleglosc(a.lat, a.lon, o[2], o[3]) }))
    .filter((x) => x.d <= a.promien_m)
    .sort((x, y) => x.d - y.d);
  const uwagi = ["Brak obiektu w OSM nie dowodzi braku usługi. Kategorie i pokrycie zależą od społeczności OSM.",
    "Odległość w linii prostej od punktu; obiekty posortowane od najbliższego. Dla obszarów (np. parków) liczona do środka obiektu."];
  if (!wMigawce) uwagi.push("Okrąg wychodzi poza zasięg migawki (Kraków z buforem ok. 5 km); obiekty spoza niej nie są uwzględnione.");
  return { zrodlo: dane.zrodlo, data_stanu: dane.data_stanu, kompletne: wMigawce && trafione.length <= a.limit, uwagi,
    obiekty: trafione.slice(0, a.limit).map(({ o, d }) => ({ osm_id: o[1], osm_typ: TYP[o[0]], nazwa: o[4] ?? a.kategoria, lat: o[2], lon: o[3], odleglosc_m: Math.round(d), adres: o[5] ?? {}, kategoria: a.kategoria })) };
}
