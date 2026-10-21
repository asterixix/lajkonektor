// Sieć ZTP budowana w czasie działania z GTFS statycznego pobieranego na żywo z gtfs.ztp.krakow.pl.
// Indeks (przystanki, linie, wzorce kursów) jest cache'owany pod kluczem wersji pliku (Last-Modified), więc każda
// aktualizacja ZTP odświeża dane bez wdrożenia. Realtime (GTFS-RT) jest czytany osobno, przy każdym zapytaniu.
//
// Pamięć Workera to ok. 128 MB, a zip autobusów ma 15 MB (73 MB po rozpakowaniu), więc plik jest czytany strumieniowo:
// nigdy nie trzymamy całego zipa ani tekstu stop_times, a czasy przejazdu zapisujemy w zwartych tablicach typowanych.
import { Unzip, UnzipInflate } from "fflate";

export const BAZA_ZTP = "https://gtfs.ztp.krakow.pl";
export const FEEDY = { A: "autobus", T: "tramwaj", M: "linie aglomeracyjne", K: "pociągi (PKP PLK: Koleje Małopolskie, PolRegio, Intercity i in.)" } as const;
export type Feed = keyof typeof FEEDY;
// Feedy ZTP mają GTFS-RT (pozycje i opóźnienia na żywo) oraz komunikaty; pociągi (K) tylko rozkład.
export const FEEDY_ZTP = ["A", "T", "M"] as const satisfies readonly Feed[];
export const czyZtp = (f: Feed): boolean => (FEEDY_ZTP as readonly string[]).includes(f);
// Rozkłady pociągów: zbiorczy GTFS z rozkładów PKP PLK składany codziennie przez mkuran.pl (ok. 33 MB); z całej Polski bierzemy Małopolskę.
export const PKP_GTFS = "https://mkuran.pl/gtfs/polish_trains.zip";
const ZIP_URL: Record<Feed, string> = { A: `${BAZA_ZTP}/GTFS_KRK_A.zip`, T: `${BAZA_ZTP}/GTFS_KRK_T.zip`, M: `${BAZA_ZTP}/GTFS_KRK_M.zip`, K: PKP_GTFS };
// [zachód, południe, wschód, północ]: Małopolska z zapasem (Kraków, Tarnów, Nowy Sącz, Zakopane, Oświęcim, granica z Katowicami).
const OBSZAR_K: [number, number, number, number] = [18.9, 49.2, 21.5, 50.5];
import { WERSJA } from "./wersja.ts";
const UA = `lajkonektor/${WERSJA} (+https://lajkonektor.sendyka.workers.dev)`;

export type Przystanek = [feed: Feed, id: string, nazwa: string, lat: number, lon: number, kod: string];
export type Linia = [feed: Feed, id: string, numer: string, nazwa: string, typ: number];
// [indeks linii, kierunek, kierunek_opis, przystanki(indeksy), minuty skumulowane, kursy/h: dzień roboczy, sobota, niedziela]
// Dla pociągów dodatkowo dokładne odjazdy z pierwszego przystanku wzorca (minuty od północy) osobno dla dnia roboczego, soboty i niedzieli.
export type Odjazdy = Record<"wd" | "sa" | "su", number[]>;
export type Wzorzec = [linia: number, kier: number, opis: string, stops: number[], min: number[], wd: number[], sa: number[], su: number[], odjazdy?: Odjazdy];
export interface SiecFeedu {
  feed: Feed;
  wersja: string | null;
  last_modified: string | null;
  zbudowano: string;
  dni_wzorcowe: Record<"wd" | "sa" | "su", string>;
  przystanki: Przystanek[];
  linie: Linia[];
  wzorce: Wzorzec[];
  // Tylko tramwaje: feed GTFS-RT nie podaje route_id, więc potrzebna jest mapa kurs -> linia*2+kierunek.
  kursy?: Record<string, number>;
}

// --- CSV
function splitLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

// Czytnik linii dla jednego pliku: przyjmuje porcje bajtów, woła `naLinie` dla każdej pełnej linii.
class CzytnikLinii {
  private dec = new TextDecoder("utf-8");
  private ogon = "";
  private naLinie: (l: string) => void;
  constructor(naLinie: (l: string) => void) { this.naLinie = naLinie; }
  dane(chunk: Uint8Array, final: boolean) {
    const czesci = (this.ogon + this.dec.decode(chunk, { stream: !final })).split("\n");
    this.ogon = czesci.pop() ?? "";
    for (const c of czesci) if (c) this.naLinie(c.endsWith("\r") ? c.slice(0, -1) : c);
    if (final && this.ogon) { this.naLinie(this.ogon); this.ogon = ""; }
  }
}

// Czytnik z nagłówkiem: callback dostaje obiekt kolumna -> wartość.
const zNaglowkiem = (cb: (r: Record<string, string>) => void) => {
  let head: string[] | null = null;
  return new CzytnikLinii((l) => {
    const v = splitLine(l.replace(/^﻿/, ""));
    if (!head) { head = v; return; }
    const o: Record<string, string> = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = v[j];
    cb(o);
  });
};

const sek = (t: string) => { const [h, m, s] = t.split(":"); return +h * 3600 + +m * 60 + +s; };
const mediana = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const DNI = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Najbliższy wtorek, sobota i niedziela (daty wzorcowe do liczenia kursów na godzinę).
function datyWzorcowe(od: Date) {
  const nast = (dow: number) => {
    const d = new Date(Date.UTC(od.getUTCFullYear(), od.getUTCMonth(), od.getUTCDate()));
    while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };
  return { wd: nast(2), sa: nast(6), su: nast(0) };
}
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

// Rosnąca tablica typowana (podwajanie), żeby nie trzymać milionów liczb w zwykłych tablicach JS.
class Rosnaca<T extends Uint16Array | Int32Array> {
  tab: T;
  n = 0;
  private Ctor: new (n: number) => T;
  constructor(Ctor: new (n: number) => T, start = 1 << 16) { this.Ctor = Ctor; this.tab = new Ctor(start); }
  dodaj(v: number) {
    if (this.n === this.tab.length) { const nowa = new this.Ctor(this.tab.length * 2); nowa.set(this.tab as any); this.tab = nowa; }
    this.tab[this.n++] = v;
  }
}

// Budowniczy sieci: przyjmuje porcje zipa (pliki w dowolnej kolejności), a `zakoncz()` składa wzorce.
export class BudowniczySieci {
  private uz: Unzip;
  private fi: Record<string, string> = {};
  private przystanki: Przystanek[] = [];
  private idxP = new Map<string, number>();
  private linie: Linia[] = [];
  private idxL = new Map<string, number>();
  private cal: Record<string, string>[] = [];
  private exc: Record<string, string>[] = [];
  private intern = new Map<string, string>();
  private surowe: { route_id: string; trip_id: string; head: string; dir: string; service: string }[] = [];

  // stop_times: zwarte tablice (przystanek lokalny, offset od pierwszego odjazdu) + opis kursów
  private stopLok = new Map<string, number>();
  private stopLokNazwy: string[] = [];
  private tStop = new Rosnaca(Uint16Array);
  private tOff = new Rosnaca(Int32Array);
  private kursId: string[] = [];
  private kursStart: number[] = [];
  private kursT0: number[] = [];
  private col: Record<string, number> | null = null;
  private biezacy: string | null = null;
  private buf: [number, number, number, number][] = [];

  private feed: Feed;
  private meta: { last_modified: string | null };
  private dokladne: boolean;

  constructor(feed: Feed, meta: { last_modified: string | null }) {
    this.feed = feed;
    this.meta = meta;
    this.dokladne = feed === "K";
    this.uz = new Unzip((file) => {
      const cz = this.czytnikDla(file.name);
      if (!cz) return;
      file.ondata = (err, chunk, final) => { if (err) throw err; cz.dane(chunk, final); };
      file.start();
    });
    this.uz.register(UnzipInflate);
  }

  private czytnikDla(nazwa: string): CzytnikLinii | null {
    const i = (x: string) => this.intern.get(x) ?? (this.intern.set(x, x), x);
    switch (nazwa) {
      case "feed_info.txt": return zNaglowkiem((r) => { this.fi = r; });
      case "stops.txt": return zNaglowkiem((s) => {
        if (s.location_type && s.location_type !== "0") return;
        this.idxP.set(s.stop_id, this.przystanki.length);
        this.przystanki.push([this.feed, s.stop_id, s.stop_name, +(+s.stop_lat).toFixed(5), +(+s.stop_lon).toFixed(5), s.platform_code || s.stop_desc || ""]);
      });
      case "routes.txt": return zNaglowkiem((r) => {
        this.idxL.set(r.route_id, this.linie.length);
        this.linie.push([this.feed, r.route_id, r.route_short_name || r.route_long_name, r.route_long_name, +r.route_type]);
      });
      case "calendar.txt": return zNaglowkiem((r) => { this.cal.push(r); });
      case "calendar_dates.txt": return zNaglowkiem((r) => { this.exc.push(r); });
      case "trips.txt": return zNaglowkiem((t) => {
        this.surowe.push({ route_id: i(t.route_id), trip_id: t.trip_id, head: i(t.trip_headsign ?? ""), dir: t.direction_id || "0", service: i(t.service_id) });
      });
      case "stop_times.txt": return new CzytnikLinii((l) => this.wierszStopTimes(l));
      default: return null;
    }
  }

  private zamknijKurs() {
    if (this.biezacy === null || this.buf.length < 2) { this.buf = []; return; }
    this.buf.sort((a, b) => a[0] - b[0]);
    const t0 = this.buf[0][3];
    this.kursId.push(this.biezacy);
    this.kursStart.push(this.tStop.n);
    this.kursT0.push(t0);
    for (const x of this.buf) { this.tStop.dodaj(x[1]); this.tOff.dodaj(x[2] - t0); }
    this.buf = [];
  }

  private wierszStopTimes(l: string) {
    const v = splitLine(l);
    if (!this.col) { this.col = Object.fromEntries(v.map((n, k) => [n.replace(/^﻿/, ""), k])); return; }
    const tid = v[this.col.trip_id];
    if (tid !== this.biezacy) { this.zamknijKurs(); this.biezacy = tid; }
    const sid = v[this.col.stop_id];
    let lok = this.stopLok.get(sid);
    if (lok === undefined) { lok = this.stopLokNazwy.length; this.stopLok.set(sid, lok); this.stopLokNazwy.push(sid); }
    this.buf.push([+v[this.col.stop_sequence], lok, sek(v[this.col.arrival_time] || v[this.col.departure_time]), sek(v[this.col.departure_time] || v[this.col.arrival_time])]);
  }

  push(chunk: Uint8Array, final = false) { this.uz.push(chunk, final); }

  zakoncz(): SiecFeedu {
    this.zamknijKurs();
    const tripsMeta = new Map<string, [number, number, string, string]>(); // [linia, kierunek, opis, usługa]
    for (const t of this.surowe) {
      const l = this.idxL.get(t.route_id);
      if (l !== undefined) tripsMeta.set(t.trip_id, [l, +t.dir, t.head, t.service]);
    }
    this.surowe = [];
    const dz = datyWzorcowe(new Date());
    const uslugi: Record<"wd" | "sa" | "su", Set<string>> = { wd: new Set(), sa: new Set(), su: new Set() };
    for (const k of ["wd", "sa", "su"] as const) {
      const d = dz[k], s = ymd(d);
      for (const c of this.cal) if (c.start_date <= s && s <= c.end_date && c[DNI[d.getUTCDay()]] === "1") uslugi[k].add(c.service_id);
      for (const e of this.exc) if (e.date === s) { if (e.exception_type === "1") uslugi[k].add(e.service_id); else uslugi[k].delete(e.service_id); }
    }
    // lokalny indeks przystanku ze stop_times -> indeks w przystankach (lub -1)
    const mapaP = this.stopLokNazwy.map((id) => this.idxP.get(id) ?? -1);

    type Agr = { l: number; dir: number; heads: Map<string, number>; ids: number[]; off: number[][]; wd: number[]; sa: number[]; su: number[]; start: Odjazdy };
    const wz = new Map<string, Agr>();
    for (let k = 0; k < this.kursId.length; k++) {
      const t = tripsMeta.get(this.kursId[k]);
      if (!t) continue;
      const od = this.kursStart[k], koniec = k + 1 < this.kursId.length ? this.kursStart[k + 1] : this.tStop.n;
      const ids: number[] = [];
      let zly = false;
      for (let j = od; j < koniec; j++) { const p = mapaP[this.tStop.tab[j]]; if (p < 0) { zly = true; break; } ids.push(p); }
      if (zly || ids.length < 2) continue;
      const key = `${t[0]}|${t[1]}|${ids.join(",")}`;
      let w = wz.get(key);
      if (!w) wz.set(key, (w = { l: t[0], dir: t[1], heads: new Map(), ids, off: ids.map(() => []), wd: Array(24).fill(0), sa: Array(24).fill(0), su: Array(24).fill(0), start: { wd: [], sa: [], su: [] } }));
      w.heads.set(t[2], (w.heads.get(t[2]) ?? 0) + 1);
      if (w.off[0].length < 30) for (let j = od; j < koniec; j++) w.off[j - od].push(this.tOff.tab[j]); // próbka do mediany
      const h = Math.floor(this.kursT0[k] / 3600) % 24;
      for (const u of ["wd", "sa", "su"] as const) if (uslugi[u].has(t[3])) { w[u][h]++; if (this.dokladne) w.start[u].push(Math.round(this.kursT0[k] / 60)); }
    }
    const wzorce: Wzorzec[] = [];
    for (const w of wz.values()) {
      let opis = "", n = -1;
      for (const [h, c] of w.heads) if (c > n) { opis = h; n = c; }
      let prev = 0;
      const min = w.off.map((o) => { prev = Math.max(prev, Math.round(mediana(o) / 60)); return prev; });
      if (!this.dokladne) { wzorce.push([w.l, w.dir, opis, w.ids, min, w.wd, w.sa, w.su]); continue; }
      // Pociągi: zostawiamy tylko przystanki z obszaru (reszta Polski jest nam zbędna), a odjazdy przeliczamy na pierwszy z zachowanych.
      const wObszarze = w.ids.map((p) => { const q = this.przystanki[p]; return q[4] >= OBSZAR_K[0] && q[3] >= OBSZAR_K[1] && q[4] <= OBSZAR_K[2] && q[3] <= OBSZAR_K[3]; });
      const zostaje = w.ids.map((_, j) => j).filter((j) => wObszarze[j]);
      if (zostaje.length < 2) continue;
      const przesuniecie = min[zostaje[0]];
      const unik = (a: number[]) => [...new Set(a.map((x) => x + przesuniecie))].sort((x, y) => x - y);
      wzorce.push([w.l, w.dir, opis, zostaje.map((j) => w.ids[j]), zostaje.map((j) => min[j] - przesuniecie), w.wd, w.sa, w.su, { wd: unik(w.start.wd), sa: unik(w.start.sa), su: unik(w.start.su) }]);
    }
    let przystanki = this.przystanki;
    if (this.dokladne) {
      // Zagęszczamy listę przystanków do tych, które występują we wzorcach, i przenumerowujemy indeksy.
      const nowy = new Map<number, number>();
      for (const w of wzorce) w[3] = w[3].map((p) => nowy.get(p) ?? (nowy.set(p, nowy.size), nowy.size - 1));
      przystanki = [...nowy.keys()].map((p) => this.przystanki[p]);
    }
    return {
      feed: this.feed, wersja: this.fi.feed_version ?? null, last_modified: this.meta.last_modified, zbudowano: new Date().toISOString(),
      dni_wzorcowe: { wd: ymd(dz.wd), sa: ymd(dz.sa), su: ymd(dz.su) },
      przystanki, linie: this.linie, wzorce,
      kursy: this.feed === "T" ? Object.fromEntries([...tripsMeta].map(([id, t]) => [id, t[0] * 2 + t[1]])) : undefined,
    };
  }
}

// Wersja synchroniczna dla całego zipa w pamięci (testy i małe pliki).
export function zbudujSiecFeedu(feed: Feed, zip: Uint8Array, meta: { last_modified: string | null }): SiecFeedu {
  const b = new BudowniczySieci(feed, meta);
  b.push(zip, true);
  return b.zakoncz();
}

// --- ładowanie: nagłówek Last-Modified z ZTP (na żywo) -> cache pod kluczem wersji -> budowa tylko przy zmianie
const pamiec = new Map<Feed, { klucz: string; sprawdzono: number; siec: SiecFeedu }>();
const SPRAWDZ_CO_MS = 10 * 60_000;

async function naglowek(feed: Feed): Promise<string | null> {
  const r = await fetch(ZIP_URL[feed], { method: "HEAD", headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} (HEAD ${ZIP_URL[feed]})`);
  return r.headers.get("last-modified");
}

// Pobiera zip na żywo i buduje sieć strumieniowo (bez trzymania całego pliku w pamięci).
async function zbudujZeStrumienia(feed: Feed, lm: string | null): Promise<SiecFeedu> {
  const res = await fetch(ZIP_URL[feed], { headers: { "user-agent": UA }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} (${ZIP_URL[feed]})`);
  const b = new BudowniczySieci(feed, { last_modified: lm });
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) { b.push(new Uint8Array(0), true); break; }
    b.push(value, false);
  }
  return b.zakoncz();
}

export async function siecFeedu(feed: Feed): Promise<SiecFeedu> {
  const mem = pamiec.get(feed);
  if (mem && Date.now() - mem.sprawdzono < SPRAWDZ_CO_MS) return mem.siec;
  let lm: string | null = null;
  try { lm = await naglowek(feed); } catch (e) { if (mem) return mem.siec; throw e; }
  const klucz = `https://lajkonektor.cache/siec/v5/${feed}/${encodeURIComponent(lm ?? "brak")}`;
  if (mem && mem.klucz === klucz) { mem.sprawdzono = Date.now(); return mem.siec; }

  const cache = typeof caches !== "undefined" ? (caches as any).default : null;
  const hit = cache ? await cache.match(klucz) : null;
  let siec: SiecFeedu;
  if (hit) siec = await hit.json();
  else {
    siec = await zbudujZeStrumienia(feed, lm);
    if (cache) await cache.put(klucz, new Response(JSON.stringify(siec), { headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" } }));
  }
  pamiec.set(feed, { klucz, sprawdzono: Date.now(), siec });
  return siec;
}
