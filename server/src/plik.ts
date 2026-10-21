// Odczyt plików z otwartych źródeł (CSV, XLSX, GeoJSON/JSON): tabela, profil kolumn, filtrowanie i agregacja po stronie serwera.
// Bezpieczeństwo: tylko https, dozwolone hosty instytucji publicznych (gov.pl, krakow.pl), ręczna obsługa przekierowań,
// limit rozmiaru i czasu. Pliki są pobierane na żywo, nic nie jest zapisywane.
import { unzipSync } from "fflate";
import { bbox, centroid, ringAreaHa, type Ring } from "./geo.ts";
import { agreguj, sortuj, type Fn } from "./zapytanie.ts";

export const MAX_BAJTOW = 8 * 1024 * 1024;
const MAX_WIERSZY = 50_000;
const MAX_ZNAKOW = 60_000;
import { WERSJA } from "./wersja.ts";
const UA = `lajkonektor/${WERSJA} (konkurs Open Data App Krakow)`;

// --- bezpieczeństwo
const dozwolonyHost = (h: string) => h === "gov.pl" || h.endsWith(".gov.pl") || h === "krakow.pl" || h.endsWith(".krakow.pl");
const literalIp = (h: string) => /^[\d.]+$/.test(h) || h.includes(":") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal");

export function sprawdzUrl(u: URL, pierwszy: boolean): URL {
  if (u.protocol !== "https:") throw new Error("Dozwolony jest tylko https.");
  if (u.port && u.port !== "443") throw new Error("Niestandardowe porty są niedozwolone.");
  if (u.username || u.password) throw new Error("Adres z danymi logowania jest niedozwolony.");
  const h = u.hostname.toLowerCase();
  if (literalIp(h)) throw new Error("Adresy IP i hosty lokalne są niedozwolone.");
  // Pierwszy adres musi należeć do instytucji publicznych; przekierowania z takiego adresu (np. dane.gov.pl -> serwer dostawcy) są dozwolone.
  if (pierwszy && !dozwolonyHost(h)) throw new Error(`Host '${h}' nie jest dozwolony. Dozwolone: *.gov.pl, *.krakow.pl (np. api.dane.gov.pl, msip3.um.krakow.pl).`);
  return u;
}

async function pobierz(url: string): Promise<{ bytes: Uint8Array; typ: string; koncowy: string; nazwa: string | null }> {
  let u = sprawdzUrl(new URL(url), true);
  for (let skok = 0; skok < 4; skok++) {
    const res = await fetch(u, { redirect: "manual", headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(25_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Przekierowanie bez nagłówka Location (HTTP ${res.status}).`);
      u = sprawdzUrl(new URL(loc, u), false);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} dla ${u.host}${u.pathname.slice(0, 60)}`);
    const dl = Number(res.headers.get("content-length") ?? 0);
    if (dl > MAX_BAJTOW) throw new Error(`Plik za duży: ${(dl / 1e6).toFixed(1)} MB (limit ${MAX_BAJTOW / 1e6} MB).`);
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > MAX_BAJTOW) { await reader.cancel(); throw new Error(`Plik za duży (limit ${MAX_BAJTOW / 1e6} MB).`); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
    const cd = res.headers.get("content-disposition") ?? "";
    return { bytes, typ: (res.headers.get("content-type") ?? "").toLowerCase(), koncowy: `${u.host}${u.pathname}`, nazwa: /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)?.[1] ?? null };
  }
  throw new Error("Zbyt wiele przekierowań.");
}

// --- tabela
type Komorka = string | number | boolean | null;
interface Tabela { kolumny: string[]; wiersze: Komorka[][]; uwagi: string[]; arkusze?: string[] }

const dekoduj = (b: Uint8Array): { tekst: string; kodowanie: string } => {
  try { return { tekst: new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^﻿/, ""), kodowanie: "utf-8" }; }
  catch { return { tekst: new TextDecoder("windows-1250").decode(b), kodowanie: "windows-1250" }; }
};

function parseCsv(tekst: string, separator: string | undefined, maxWierszy: number) {
  const pierwsza = tekst.slice(0, tekst.indexOf("\n") > 0 ? tekst.indexOf("\n") : 4096);
  const licz = (c: string) => { let q = false, n = 0; for (const ch of pierwsza) { if (ch === '"') q = !q; else if (!q && ch === c) n++; } return n; };
  const sep = separator ?? [";", "\t", ",", "|"].map((c) => ({ c, n: licz(c) })).sort((a, b) => b.n - a.n)[0].c;
  const wiersze: string[][] = [];
  let w: string[] = [], pole = "", q = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (q) {
      if (c === '"') { if (tekst[i + 1] === '"') { pole += '"'; i++; } else q = false; } else pole += c;
    } else if (c === '"') q = true;
    else if (c === sep) { w.push(pole); pole = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && tekst[i + 1] === "\n") i++;
      w.push(pole); pole = "";
      if (w.length > 1 || w[0] !== "") wiersze.push(w);
      w = [];
      if (wiersze.length > maxWierszy) break;
    } else pole += c;
  }
  if (pole !== "" || w.length) { w.push(pole); wiersze.push(w); }
  return { wiersze, sep };
}

const LICZBA = /^-?\d+([.,]\d+)?$/;
const LICZBA_SPACJE = /^-?\d{1,3}(\s\d{3})+([.,]\d+)?$/;
const naLiczbe = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

// Kolumny w całości liczbowe konwertujemy na liczby (przecinek dziesiętny, spacje tysięcy).
function typuj(kolumny: string[], wiersze: string[][]): Tabela["wiersze"] {
  const lic = kolumny.map((_, j) => {
    let jest = false;
    for (const w of wiersze) { const v = (w[j] ?? "").trim(); if (v === "") continue; if (!(LICZBA.test(v) || LICZBA_SPACJE.test(v))) return false; jest = true; }
    return jest;
  });
  return wiersze.map((w) => kolumny.map((_, j) => { const v = (w[j] ?? "").trim(); return v === "" ? null : lic[j] ? naLiczbe(v) : v; }));
}

function nazwyKolumn(h: (string | null | undefined)[]): string[] {
  const widziane = new Map<string, number>();
  return h.map((x, i) => {
    let n = (x ?? "").toString().trim() || `kolumna_${i + 1}`;
    const k = widziane.get(n) ?? 0;
    widziane.set(n, k + 1);
    if (k) n = `${n}_${k + 1}`;
    return n;
  });
}

function odCsv(bytes: Uint8Array, opcje: Opcje): Tabela {
  const { tekst, kodowanie } = dekoduj(bytes);
  const { wiersze, sep } = parseCsv(tekst, opcje.separator, MAX_WIERSZY);
  if (!wiersze.length) throw new Error("Pusty plik CSV.");
  const kolumny = nazwyKolumn(wiersze[0]);
  const dane = wiersze.slice(1).map((w) => w.slice(0, kolumny.length));
  return { kolumny, wiersze: typuj(kolumny, dane), uwagi: [`CSV: separator '${sep === "\t" ? "TAB" : sep}', kodowanie ${kodowanie}.`] };
}

// --- XLSX (minimalny parser OOXML: bez zależności, tylko potrzebne części)
const encje = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
const tekstXml = (b: Uint8Array | undefined) => (b ? new TextDecoder("utf-8").decode(b) : "");
const kolIdx = (ref: string) => { let n = 0; for (const c of ref.replace(/\d+/g, "")) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
const DATA_WBUDOWANE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function serialNaDate(s: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400) * 1000);
  const iso = d.toISOString();
  return Number.isInteger(s) ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
}

function odXlsx(bytes: Uint8Array, opcje: Opcje): Tabela {
  const pliki = unzipSync(bytes, { filter: (f) => f.originalSize <= 60 * 1024 * 1024 && (/^xl\/(workbook|styles|sharedStrings)\.xml$/.test(f.name) || f.name === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)) });
  const wb = tekstXml(pliki["xl/workbook.xml"]);
  const rels = tekstXml(pliki["xl/_rels/workbook.xml.rels"]);
  const arkusze = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ nazwa: encje(/name="([^"]*)"/.exec(m[0])?.[1] ?? ""), rid: /r:id="([^"]*)"/.exec(m[0])?.[1] ?? "" }));
  if (!arkusze.length) throw new Error("Nie znaleziono arkuszy w pliku XLSX.");
  let wybrany = arkusze[0];
  if (opcje.arkusz !== undefined) {
    const po = typeof opcje.arkusz === "number" ? arkusze[opcje.arkusz - 1] : arkusze.find((a) => a.nazwa.toLowerCase() === String(opcje.arkusz).toLowerCase());
    if (!po) throw new Error(`Nie ma arkusza '${opcje.arkusz}'. Dostępne: ${arkusze.map((a) => a.nazwa).join(", ")}.`);
    wybrany = po;
  }
  const cel = new RegExp(`<Relationship\\b[^>]*Id="${wybrany.rid}"[^>]*>`).exec(rels)?.[0].match(/Target="([^"]*)"/)?.[1] ?? "worksheets/sheet1.xml";
  const sciezka = cel.startsWith("/") ? cel.slice(1) : `xl/${cel}`;
  const arkuszXml = tekstXml(pliki[sciezka]);
  if (!arkuszXml) throw new Error(`Brak danych arkusza (${sciezka}).`);

  const wspolne = [...tekstXml(pliki["xl/sharedStrings.xml"]).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => encje([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));

  // style: które indeksy komórek są datami
  const styles = tekstXml(pliki["xl/styles.xml"]);
  const wlasne = new Map([...styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [+m[1], encje(m[2])]));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const czyData = [...xfs.matchAll(/<xf\b[^>]*numFmtId="(\d+)"/g)].map((m) => {
    const id = +m[1];
    const kod = wlasne.get(id);
    return DATA_WBUDOWANE.has(id) || (kod !== undefined && /[ymd]/i.test(kod.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "")) && !/[#0]/.test(kod.replace(/"[^"]*"/g, "")));
  });

  const wiersze: Komorka[][] = [];
  for (const rm of arkuszXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const w: Komorka[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attr = cm[1], tr = /\bt="([^"]*)"/.exec(attr)?.[1], ref = /\br="([^"]*)"/.exec(attr)?.[1], st = /\bs="(\d+)"/.exec(attr)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2] ?? "")?.[1];
      let wartosc: Komorka = null;
      if (tr === "s" && v !== undefined) wartosc = wspolne[+v] ?? null;
      else if (tr === "inlineStr") wartosc = encje([...(cm[2] ?? "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else if (tr === "b") wartosc = v === "1";
      else if (tr === "str" || tr === "e") wartosc = v === undefined ? null : encje(v);
      else if (v !== undefined && v !== "") { const num = Number(v); wartosc = st !== undefined && czyData[+st] ? serialNaDate(num) : num; }
      const j = ref ? kolIdx(ref) : w.length;
      while (w.length < j) w.push(null);
      w[j] = wartosc;
    }
    if (w.some((x) => x !== null)) wiersze.push(w);
    if (wiersze.length > MAX_WIERSZY) break;
  }
  if (!wiersze.length) throw new Error("Arkusz jest pusty.");
  const szer = Math.max(...wiersze.slice(0, 200).map((w) => w.length));
  const kolumny = nazwyKolumn(Array.from({ length: szer }, (_, i) => (wiersze[0][i] as string | null) ?? null));
  return {
    kolumny, wiersze: wiersze.slice(1).map((w) => kolumny.map((_, i) => w[i] ?? null)), arkusze: arkusze.map((a) => a.nazwa),
    uwagi: [`XLSX: arkusz '${wybrany.nazwa}'; pierwszy wiersz potraktowano jako nagłówek; komórki z formatem daty zamieniono na tekst ISO.`],
  };
}

// --- GeoJSON / JSON
function odGeoJson(bytes: Uint8Array, opcje: Opcje): Tabela {
  const j = JSON.parse(dekoduj(bytes).tekst);
  const uwagi: string[] = [];
  const cechy: { properties?: Record<string, any>; geometry?: any }[] =
    j.type === "FeatureCollection" ? j.features ?? [] : j.type === "Feature" ? [j]
    : Array.isArray(j) ? j.map((x) => ({ properties: x }))
    : j.type ? [{ geometry: j, properties: {} }] : [];
  if (!cechy.length) throw new Error("Nie rozpoznano obiektów w pliku JSON/GeoJSON.");
  const jestGeo = cechy.some((c) => c.geometry);
  const klucze = [...new Set(cechy.slice(0, 200).flatMap((c) => Object.keys(c.properties ?? {})))];
  const dodatkowe = jestGeo && opcje.geometria !== "brak" ? ["_geometria", "_srodek_lat", "_srodek_lon", "_bbox", "_powierzchnia_ha"] : [];
  let poza = false;
  const wiersze = cechy.slice(0, MAX_WIERSZY).map((c) => {
    const p = c.properties ?? {};
    const baza: Komorka[] = klucze.map((k) => { const v = p[k]; return v === undefined || v === null ? null : typeof v === "object" ? JSON.stringify(v) : v; });
    if (!dodatkowe.length) return baza;
    const g = c.geometry;
    const pierscienie: Ring[] = g?.type === "Polygon" ? [g.coordinates[0]] : g?.type === "MultiPolygon" ? g.coordinates.map((x: any) => x[0]) : [];
    const punkty: Ring = g?.type === "Point" ? [g.coordinates] : g?.type === "LineString" ? g.coordinates : g?.type === "MultiPoint" ? g.coordinates : [];
    const wszystkie = pierscienie.length ? pierscienie : punkty.length ? [punkty] : [];
    if (!wszystkie.length) return [...baza, g?.type ?? null, null, null, null, null];
    if (wszystkie.flat().some((x) => Math.abs(x[0]) > 180 || Math.abs(x[1]) > 90)) { poza = true; return [...baza, g.type, null, null, null, null]; }
    const s = pierscienie.length ? centroid(pierscienie) : { lat: +(punkty.reduce((a, x) => a + x[1], 0) / punkty.length).toFixed(6), lon: +(punkty.reduce((a, x) => a + x[0], 0) / punkty.length).toFixed(6) };
    const b = bbox(wszystkie);
    const pole = pierscienie.length ? +pierscienie.reduce((a, r) => a + ringAreaHa(r), 0).toFixed(3) : null;
    return [...baza, g.type, s.lat, s.lon, b.map((x) => +x.toFixed(5)).join(","), pole];
  });
  if (poza) uwagi.push("Współrzędne poza zakresem WGS84 (lon/lat): prawdopodobnie inny układ (np. EPSG:2178); środki i pola nie zostały policzone.");
  if (cechy.length > MAX_WIERSZY) uwagi.push(`Wczytano pierwsze ${MAX_WIERSZY} z ${cechy.length} obiektów.`);
  uwagi.push(jestGeo ? "GeoJSON: dla każdego obiektu podano typ geometrii, środek (lat/lon), ramkę (zach,pld,wsch,pln) i pole w ha dla wielokątów; pełne współrzędne pominięto." : "JSON: tablica obiektów potraktowana jako tabela.");
  return { kolumny: [...klucze, ...dodatkowe], wiersze, uwagi };
}

// --- profil kolumn
function profil(t: Tabela) {
  return t.kolumny.map((nazwa, j) => {
    const v = t.wiersze.map((w) => w[j]);
    const niepuste = v.filter((x) => x !== null);
    const liczby = niepuste.filter((x): x is number => typeof x === "number");
    const typ = !niepuste.length ? "pusta" : liczby.length === niepuste.length ? "liczba" : niepuste.every((x) => typeof x === "boolean") ? "logiczna" : "tekst";
    const out: Record<string, unknown> = { nazwa, typ, puste: v.length - niepuste.length };
    if (typ === "liczba") {
      const suma = liczby.reduce((a, b) => a + b, 0);
      Object.assign(out, { min: Math.min(...liczby), max: Math.max(...liczby), suma: +suma.toFixed(4), srednia: +(suma / liczby.length).toFixed(4) });
    } else if (typ === "tekst") {
      const u = new Set(niepuste.map(String));
      out.unikalne = u.size;
      out.przyklady = [...u].slice(0, 3).map((x) => (x.length > 50 ? x.slice(0, 50) + "…" : x));
    }
    return out;
  });
}

export interface Opcje {
  format?: "csv" | "xlsx" | "geojson" | "json";
  arkusz?: string | number;
  separator?: string;
  geometria?: "podsumowanie" | "brak";
}
export interface Zapytanie extends Opcje {
  url: string;
  pola?: string[];
  sortuj?: string;
  limit?: number;
  offset?: number;
  grupuj_po?: string[];
  agreguj?: { fn: Fn; pole: string; nazwa?: string }[];
}

export function wykryjFormat(bytes: Uint8Array, typ: string, url: string): NonNullable<Opcje["format"]> {
  const u = url.toLowerCase().split("?")[0];
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx"; // PK = zip (xlsx)
  if (/geo\+?json/.test(typ) || u.endsWith(".geojson")) return "geojson";
  const start = new TextDecoder().decode(bytes.subarray(0, 200)).trimStart();
  if (start.startsWith("{") || start.startsWith("[")) return "geojson";
  if (/csv/.test(typ) || u.endsWith(".csv") || u.endsWith(".txt")) return "csv";
  return "csv";
}

export function wTabele(bytes: Uint8Array, format: NonNullable<Opcje["format"]>, opcje: Opcje): Tabela {
  return format === "xlsx" ? odXlsx(bytes, opcje) : format === "csv" ? odCsv(bytes, opcje) : odGeoJson(bytes, opcje);
}

// Wspólna obróbka: pola, agregacja, sortowanie, stronicowanie.
export function obrobka(t: Tabela, q: Pick<Zapytanie, "pola" | "sortuj" | "limit" | "offset" | "grupuj_po" | "agreguj">) {
  const uwagi = [...t.uwagi];
  const doObiektow = (kol: string[], w: Komorka[][]) => w.map((r) => Object.fromEntries(kol.map((k, i) => [k, r[i]])));
  const nieznane = [...(q.pola ?? []), ...(q.grupuj_po ?? []), ...(q.agreguj ?? []).map((a) => a.pole)].filter((c) => !t.kolumny.includes(c));
  if (nieznane.length) throw new Error(`Nieznane kolumny: ${nieznane.join(", ")}. Dostępne: ${t.kolumny.join(", ")}.`);
  const limit = Math.min(q.limit ?? 50, 500), offset = q.offset ?? 0;
  if (q.agreguj?.length) {
    const wynik = sortuj(agreguj(doObiektow(t.kolumny, t.wiersze), q.grupuj_po ?? [], q.agreguj), q.sortuj);
    return { kolumny: [...(q.grupuj_po ?? []), ...q.agreguj.map((a) => a.nazwa ?? `${a.fn}_${a.pole}`)], wiersze: wynik.slice(offset, offset + limit), razem: wynik.length, uwagi };
  }
  let obiekty = doObiektow(t.kolumny, t.wiersze);
  if (q.sortuj) obiekty = sortuj(obiekty, q.sortuj);
  const kolumny = q.pola?.length ? q.pola : t.kolumny;
  return { kolumny, wiersze: obiekty.slice(offset, offset + limit).map((o) => Object.fromEntries(kolumny.map((k) => [k, o[k]]))), razem: obiekty.length, uwagi };
}

export async function plikOdczyt(q: Zapytanie) {
  const p = await pobierz(q.url);
  const format = q.format ?? wykryjFormat(p.bytes, p.typ, q.url);
  const t = wTabele(p.bytes, format, q);
  const o = obrobka(t, q);
  let wiersze = o.wiersze;
  while (wiersze.length > 1 && JSON.stringify(wiersze).length > MAX_ZNAKOW) wiersze = wiersze.slice(0, Math.ceil(wiersze.length / 2));
  const uwagi = [...o.uwagi];
  if (wiersze.length < o.wiersze.length) uwagi.push(`Odpowiedź przycięta do ${wiersze.length} wierszy ze względu na rozmiar; użyj 'pola', 'limit', 'offset' albo agregacji.`);
  if (t.wiersze.length >= MAX_WIERSZY) uwagi.push(`Wczytano maksymalnie ${MAX_WIERSZY} wierszy; plik może być większy.`);
  return {
    zrodlo: p.koncowy, nazwa_pliku: p.nazwa ?? undefined, format, rozmiar_kb: Math.round(p.bytes.length / 1024),
    ...(t.arkusze ? { arkusze: t.arkusze } : {}),
    wierszy_w_pliku: t.wiersze.length, wierszy_w_wyniku: o.razem,
    kolumny_profil: profil(t), ...(uwagi.length ? { uwagi } : {}),
    kolumny: o.kolumny, wiersze,
  };
}
