// Uniwersalne zapytanie do dowolnej pozycji katalogu (tabela OD albo warstwa MSIP), z agregacją i filtrem przestrzennym.
import { bbox, centroid, uprosc, zaokragl, type Ring } from "./geo.ts";
import { znajdz, type Pozycja } from "./katalog.ts";
import { PARKI_OSM_ID, parkiRings, pokrycieParkow } from "./parki.ts";
import { arcgisQuery, getJson, zCache } from "./sources.ts";

export type Fn = "sum" | "count" | "avg" | "min" | "max";
export type Geometria =
  | { punkt: { lat: number; lon: number }; promien_m?: number }
  | { bbox: [number, number, number, number] }
  | { z: { id: string; where?: string; bufor_m?: number } };

export interface Zapytanie {
  id: string;
  pola?: string[];
  filtr?: string;
  sortuj?: string;
  limit?: number;
  offset?: number;
  kursor?: string;
  grupuj_po?: string[];
  agreguj?: { fn: Fn; pole: string; nazwa?: string }[];
  geometria?: Geometria;
  zwroc_geometrie?: boolean;
  /** MSIP: dołącz uproszczone kontury (do mapy); implikuje zwroc_geometrie. */
  kontury?: boolean;
  tylko_liczba?: boolean;
}

const MAX_LIMIT = 1000;
const MAX_ZNAKOW = 60_000; // odpowiedź trafia do kontekstu modelu, więc ją przycinamy
const MAX_WIERSZY_OD_AGREGACJA = 20_000;

function pozycja(id: string): Pozycja {
  const p = znajdz(id);
  if (!p) throw new Error(`Nieznany zbiór '${id}'. Znajdź id narzędziem katalog_szukaj.`);
  return p;
}

// --- agregacja po stronie serwera Lajkonektora (dla tabel OD, które nie mają agregacji w API)
export function agreguj(rows: Record<string, any>[], grupuj: string[], agg: NonNullable<Zapytanie["agreguj"]>) {
  const grupy = new Map<string, Record<string, any>[]>();
  for (const r of rows) {
    const k = JSON.stringify(grupuj.map((g) => r[g]));
    (grupy.get(k) ?? grupy.set(k, []).get(k)!).push(r);
  }
  return [...grupy.values()].map((g) => {
    const out: Record<string, any> = Object.fromEntries(grupuj.map((c) => [c, g[0][c]]));
    for (const a of agg) {
      const v = g.map((r) => Number(r[a.pole])).filter((x) => Number.isFinite(x));
      const wynik =
        a.fn === "count" ? g.length
        : a.fn === "sum" ? v.reduce((s, x) => s + x, 0)
        : a.fn === "avg" ? (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)
        : a.fn === "min" ? (v.length ? Math.min(...v) : null)
        : (v.length ? Math.max(...v) : null);
      out[a.nazwa ?? `${a.fn}_${a.pole}`] = wynik;
    }
    return out;
  });
}

// Sortowanie wyniku agregacji po kolumnie ("pole" lub "pole desc").
export function sortuj(rows: Record<string, any>[], spec?: string) {
  if (!spec) return rows;
  // Nazwa kolumny z pliku może zawierać spacje, więc kierunek to tylko ostatnie słowo asc/desc.
  const [, pole, kier] = spec.trim().match(/^(.*?)(?:\s+(asc|desc))?$/i)!;
  const m = kier?.toLowerCase() === "desc" ? -1 : 1;
  const pusta = (v: unknown) => v == null || v === "";
  // Puste wartości zawsze na końcu, w obu kierunkach.
  return rows.slice().sort((a, b) => pusta(a[pole]) ? (pusta(b[pole]) ? 0 : 1) : pusta(b[pole]) ? -1 : a[pole] > b[pole] ? m : a[pole] < b[pole] ? -m : 0);
}

// --- tabele OD (WSO2 + DAB: $select, $filter, $orderby, $first, $after)
async function odPage(url: string, q: Zapytanie, first: number, after?: string) {
  const p = new URLSearchParams();
  if (q.pola?.length) p.set("$select", q.pola.join(","));
  if (q.filtr) p.set("$filter", q.filtr);
  if (q.sortuj) p.set("$orderby", q.sortuj);
  p.set("$first", String(first));
  if (after) p.set("$after", after);
  const j = await getJson(`${url}?${p}`);
  const next = typeof j.nextLink === "string" ? new URL(j.nextLink).searchParams.get("$after") : null;
  return { rows: (j.value ?? []) as Record<string, any>[], next };
}

async function odQuery(p: Pozycja, q: Zapytanie) {
  const limit = Math.min(q.limit ?? 100, MAX_LIMIT);
  const uwagi: string[] = [];
  if (q.agreguj?.length) {
    // Agregacja wymaga wszystkich wierszy: pobieramy strony aż do limitu bezpieczeństwa.
    let rows: Record<string, any>[] = [], after: string | undefined, ucieto = false;
    do {
      // sortuj dotyczy wyniku agregacji (np. "ha desc"), więc nie przekazujemy go do tabeli źródłowej.
      const pg = await odPage(p.url, { ...q, pola: undefined, sortuj: undefined }, 1000, after);
      rows = rows.concat(pg.rows);
      after = pg.next ?? undefined;
      if (rows.length >= MAX_WIERSZY_OD_AGREGACJA && after) { ucieto = true; break; }
    } while (after);
    if (ucieto) uwagi.push(`Agregacja na pierwszych ${rows.length} wierszach (limit bezpieczeństwa); wynik niepełny.`);
    const wynik = sortuj(agreguj(rows, q.grupuj_po ?? [], q.agreguj), q.sortuj);
    return { wiersze: wynik.slice(0, limit), ile_zrodlo: rows.length, nastepny_kursor: null as string | null, uwagi };
  }
  const pg = await odPage(p.url, q, limit, q.kursor);
  return { wiersze: pg.rows, ile_zrodlo: null, nastepny_kursor: pg.next, uwagi };
}

// --- warstwy MSIP (ArcGIS REST)
async function geometriaZ(z: { id: string; where?: string }) {
  if (z.id === PARKI_OSM_ID) {
    return { geometry: JSON.stringify({ rings: parkiRings(), spatialReference: { wkid: 4326 } }), type: "esriGeometryPolygon", n: parkiRings().length, uwaga: `Parki z OSM (pokrycie częściowe: ${pokrycieParkow().z} z ${pokrycieParkow().razem} parków).` };
  }
  const src = pozycja(z.id);
  if (src.zrodlo !== "msip") throw new Error("Obszar 'z' może pochodzić tylko z warstwy MSIP lub z 'lokalne:parki_osm'.");
  const r = await arcgisQuery(src.url, {
    where: z.where ?? "1=1", outFields: "objectid", returnGeometry: "true", outSR: "4326", geometryPrecision: "6",
    maxAllowableOffset: "0.00005", resultRecordCount: "2000",
  });
  const f: any[] = r.features ?? [];
  if (!f.length) throw new Error(`Filtr obszaru 'z' (${z.id}) nie zwrócił żadnych obiektów.`);
  const type: string = r.geometryType;
  const sr = { wkid: 4326 };
  const geometry =
    type === "esriGeometryPolygon" ? { rings: f.flatMap((x) => x.geometry?.rings ?? []), spatialReference: sr }
    : type === "esriGeometryPolyline" ? { paths: f.flatMap((x) => x.geometry?.paths ?? []), spatialReference: sr }
    : { points: f.map((x) => [x.geometry?.x, x.geometry?.y]), spatialReference: sr };
  const przyciete = r.exceededTransferLimit ? " Obszar 'z' przycięty do 2000 obiektów." : "";
  return { geometry: JSON.stringify(geometry), type: type === "esriGeometryPoint" ? "esriGeometryMultipoint" : type, n: f.length, uwaga: przyciete };
}

async function zasieg(g: Geometria, uwagi: string[]): Promise<Record<string, string>> {
  if ("punkt" in g) {
    const out: Record<string, string> = {
      geometry: JSON.stringify({ x: g.punkt.lon, y: g.punkt.lat, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    };
    if (g.promien_m) { out.distance = String(g.promien_m); out.units = "esriSRUnit_Meter"; }
    return out;
  }
  if ("bbox" in g) {
    const [xmin, ymin, xmax, ymax] = g.bbox;
    return { geometry: JSON.stringify({ xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects" };
  }
  const z = await geometriaZ(g.z);
  uwagi.push(`Filtr przestrzenny: ${z.n} obiektów z '${g.z.id}'${g.z.bufor_m ? ` z buforem ${g.z.bufor_m} m` : ""}.${z.uwaga ? " " + z.uwaga : ""}`);
  const out: Record<string, string> = { geometry: z.geometry, geometryType: z.type, inSR: "4326", spatialRel: "esriSpatialRelIntersects" };
  if (g.z.bufor_m) { out.distance = String(g.z.bufor_m); out.units = "esriSRUnit_Meter"; }
  return out;
}

function geomOut(geometry: any, kontury = false) {
  if (!geometry) return undefined;
  // Kontury upraszczamy (ok. 3 m), żeby 200 obiektów mieściło się w odpowiedzi i w karcie.
  const uproszcz = (r: Ring) => zaokragl(uprosc(r, 0.00003), 5);
  if (geometry.rings) return { srodek: centroid(geometry.rings as Ring[]), bbox: bbox(geometry.rings as Ring[]), ...(kontury ? { kontury: (geometry.rings as Ring[]).map(uproszcz) } : {}) };
  if (geometry.paths) { const pts = geometry.paths.flat(); return { punkty: pts.length, bbox: bbox([pts as Ring]), ...(kontury ? { linie_geom: (geometry.paths as Ring[]).map(uproszcz) } : {}) }; }
  if (geometry.x != null) return { lat: geometry.y, lon: geometry.x };
  return undefined;
}

async function msipQuery(p: Pozycja, q: Zapytanie) {
  const uwagi: string[] = [];
  const limit = Math.min(q.limit ?? 100, MAX_LIMIT, p.maxRecordCount ?? MAX_LIMIT);
  const params: Record<string, string> = { where: q.filtr ?? "1=1", ...(q.geometria ? await zasieg(q.geometria, uwagi) : {}) };
  if (q.tylko_liczba) {
    const r = await arcgisQuery(p.url, { ...params, returnCountOnly: "true" });
    return { wiersze: [{ liczba: r.count }], ile_zrodlo: r.count, nastepny_kursor: null as string | null, uwagi };
  }
  if (q.agreguj?.length) {
    params.outStatistics = JSON.stringify(q.agreguj.map((a) => ({ statisticType: a.fn, onStatisticField: a.pole, outStatisticFieldName: a.nazwa ?? `${a.fn}_${a.pole}` })));
    if (q.grupuj_po?.length) params.groupByFieldsForStatistics = q.grupuj_po.join(",");
    if (q.sortuj) params.orderByFields = q.sortuj;
    const r = await arcgisQuery(p.url, params);
    const wiersze = (r.features ?? []).map((f: any) => f.attributes);
    return { wiersze: wiersze.slice(0, limit), ile_zrodlo: wiersze.length, nastepny_kursor: null, uwagi };
  }
  params.outFields = q.pola?.length ? q.pola.join(",") : "*";
  const geom = q.zwroc_geometrie || q.kontury;
  params.returnGeometry = geom ? "true" : "false";
  if (geom) { params.outSR = "4326"; params.geometryPrecision = "6"; }
  if (q.sortuj) params.orderByFields = q.sortuj;
  params.resultRecordCount = String(limit);
  if (q.offset) params.resultOffset = String(q.offset);
  // Część warstw nie obsługuje stronicowania albo przy resultRecordCount zwraca 0 obiektów z exceededTransferLimit:
  // wtedy pytamy bez stronicowania i przycinamy po pobraniu.
  const bezStronicowania = async () => {
    delete params.resultRecordCount;
    delete params.resultOffset;
    const wynik = await arcgisQuery(p.url, params);
    wynik.features = (wynik.features ?? []).slice(q.offset ?? 0, (q.offset ?? 0) + limit);
    uwagi.push("Warstwa nie obsługuje stronicowania po stronie serwera: limit i offset zastosowano po pobraniu.");
    return wynik;
  };
  let r: any;
  try {
    r = await arcgisQuery(p.url, params);
    if (!(r.features?.length) && r.exceededTransferLimit) r = await bezStronicowania();
  } catch (e) {
    if (!/Pagination is not supported/.test((e as Error).message)) throw e;
    r = await bezStronicowania();
  }
  const daty = new Set(p.pola.filter((f) => f.endsWith(":Date")).map((f) => f.split(":")[0]));
  const wiersze = (r.features ?? []).map((f: any) => {
    const a = { ...f.attributes };
    for (const k of daty) if (typeof a[k] === "number") a[k] = new Date(a[k]).toISOString().slice(0, 10);
    const g = geom ? geomOut(f.geometry, q.kontury) : undefined;
    return g ? { ...a, _geometria: g } : a;
  });
  if (r.exceededTransferLimit && wiersze.length) uwagi.push(`Są kolejne wiersze: ponów z offset=${(q.offset ?? 0) + wiersze.length}.`);
  return { wiersze, ile_zrodlo: null, nastepny_kursor: null as string | null, uwagi };
}

export async function daneZapytaj(q: Zapytanie) {
  const p = pozycja(q.id);
  if (p.zrodlo === "od" && q.geometria) throw new Error("Filtr przestrzenny działa tylko dla warstw MSIP (zrodlo=msip).");
  const r = p.zrodlo === "od" ? await odQuery(p, q) : await msipQuery(p, q);
  let wiersze = r.wiersze;
  const uwagi = [...r.uwagi];
  while (wiersze.length > 1 && JSON.stringify(wiersze).length > MAX_ZNAKOW) wiersze = wiersze.slice(0, Math.ceil(wiersze.length / 2));
  if (wiersze.length < r.wiersze.length) uwagi.push(`Odpowiedź przycięta do ${wiersze.length} wierszy ze względu na rozmiar; zawęź pola lub filtr albo użyj agregacji.`);
  return {
    zrodlo: p.tytul,
    zbior: p.id,
    wiersze_zwrocone: wiersze.length,
    ...(r.nastepny_kursor ? { nastepny_kursor: r.nastepny_kursor } : {}),
    ...(uwagi.length ? { uwagi } : {}),
    wiersze,
  };
}

// Opis zbioru: pola z katalogu + żywe metadane (aliasy i słowniki kodów dla MSIP, próbka dla OD).
export async function zbiorOpis(id: string) {
  const p = pozycja(id);
  const base = { id: p.id, zrodlo: p.zrodlo, tytul: p.tytul, url: p.url, pola: p.pola, ...(p.opis ? { opis: p.opis } : {}) };
  if (p.zrodlo === "od") {
    const probka = (await zCache(`opis/${p.id}/probka`, 3600, () => getJson(`${p.url}?$first=3`))).value;
    return { ...base, wiersze: (p as any).wiersze ?? null, odswiezono: (p as any).odswiezono ?? null, probka, jak_pytac: "dane_zapytaj: filtr=OData ($filter, np. \"Rok eq 2024\"), pola, sortuj, limit, kursor; agregacje liczone po naszej stronie." };
  }
  const live = await zCache(`opis/${p.id}/meta`, 3600, () => getJson(`${p.url}?f=json`));
  const slowniki = (live.fields ?? [])
    .filter((f: any) => f.domain?.codedValues?.length)
    .map((f: any) => ({ pole: f.name, kody: f.domain.codedValues.slice(0, 30).map((c: any) => `${c.code}=${c.name}`) }));
  const liczba = (await arcgisQuery(p.url, { where: "1=1", returnCountOnly: "true" })).count;
  return {
    ...base, geometria: p.geometria, liczba_obiektow: liczba, maxRecordCount: p.maxRecordCount,
    aliasy: Object.fromEntries((live.fields ?? []).filter((f: any) => f.alias && f.alias !== f.name).map((f: any) => [f.name, f.alias])),
    ...(slowniki.length ? { slowniki } : {}),
    jak_pytac: "dane_zapytaj: filtr=SQL where (np. \"oznaczenie LIKE 'ZP%'\"), geometria={punkt,promien_m}|{bbox}|{z:{id,where,bufor_m}}, agreguj/grupuj_po, zwroc_geometrie. Współrzędne WGS84 (lat/lon).",
  };
}
