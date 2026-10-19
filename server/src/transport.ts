// Transport publiczny: przystanki w pobliżu, odjazdy na żywo (GTFS-RT) i planer tras (linie bezpośrednie i z jedną przesiadką).
// Sieć pochodzi z GTFS statycznego ZTP pobieranego w czasie działania (siec.ts), czasy rzeczywiste z TripUpdates przy każdym zapytaniu.
import { decodeFeed } from "./gtfsrt.ts";
import { BAZA_ZTP, FEEDY, czyZtp, siecFeedu, type Feed, type Linia, type Przystanek, type Wzorzec } from "./siec.ts";
import { getBytes } from "./sources.ts";

export interface Siec {
  przystanki: Przystanek[];
  linie: Linia[];
  wzorce: Wzorzec[];
  feedy: Record<string, { opis: string; wersja: string | null; last_modified: string | null; zbudowano: string }>;
  idxP: Map<string, number>; // "A:8630" -> indeks globalny
  idxL: Map<string, number>; // "A:126" -> indeks globalny
  kursLinia: Map<string, number>; // "T:trip_id" -> linia*2+kierunek (indeks globalny linii)
  naPrzystanku: [wzorzec: number, pozycja: number][][];
  siatka: Map<string, number[]>;
}

const KOMORKA = 0.002; // ~220 m
const kl = (lat: number, lon: number) => `${Math.floor(lat / KOMORKA)},${Math.floor(lon / (KOMORKA * 1.55))}`;

export function polaczSiec(czesci: Awaited<ReturnType<typeof siecFeedu>>[]): Siec {
  const przystanki: Przystanek[] = [], linie: Linia[] = [], wzorce: Wzorzec[] = [];
  const idxP = new Map<string, number>(), idxL = new Map<string, number>(), kursLinia = new Map<string, number>();
  const feedy: Siec["feedy"] = {};
  for (const c of czesci) {
    const po = przystanki.length, lo = linie.length;
    c.przystanki.forEach((p, i) => idxP.set(`${c.feed}:${p[1]}`, po + i));
    c.linie.forEach((l, i) => idxL.set(`${c.feed}:${l[1]}`, lo + i));
    for (const [id, v] of Object.entries(c.kursy ?? {})) kursLinia.set(`${c.feed}:${id}`, (Math.floor(v / 2) + lo) * 2 + (v % 2));
    przystanki.push(...c.przystanki);
    linie.push(...c.linie);
    for (const w of c.wzorce) wzorce.push([w[0] + lo, w[1], w[2], w[3].map((x) => x + po), w[4], w[5], w[6], w[7], w[8]]);
    feedy[c.feed] = { opis: FEEDY[c.feed], wersja: c.wersja, last_modified: c.last_modified, zbudowano: c.zbudowano };
  }
  const naPrzystanku: Siec["naPrzystanku"] = przystanki.map(() => []);
  wzorce.forEach((w, wi) => w[3].forEach((p, pos) => naPrzystanku[p].push([wi, pos])));
  const siatka = new Map<string, number[]>();
  przystanki.forEach((p, i) => { const k = kl(p[3], p[4]); (siatka.get(k) ?? siatka.set(k, []).get(k)!).push(i); });
  return { przystanki, linie, wzorce, feedy, idxP, idxL, kursLinia, naPrzystanku, siatka };
}

let polaczona: { klucz: string; siec: Siec } | null = null;
export async function wczytajSiec(): Promise<Siec> {
  const czesci = [];
  for (const f of Object.keys(FEEDY) as Feed[]) {
    // po kolei, żeby ograniczyć szczytową pamięć; brak rozkładu pociągów (źródło zewnętrzne) nie może zablokować komunikacji miejskiej
    try { czesci.push(await siecFeedu(f)); } catch (e) { if (czyZtp(f)) throw e; console.warn(`feed ${f}: ${(e as Error).message}`); }
  }
  const klucz = czesci.map((c) => `${c.feed}:${c.last_modified}:${c.zbudowano}`).join("|");
  if (polaczona?.klucz === klucz) return polaczona.siec;
  polaczona = { klucz, siec: polaczSiec(czesci) };
  return polaczona.siec;
}

// --- geometria i czas
const R = 6371000;
export function odleglosc(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180, x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad), y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * R;
}
// Dojście: odległość w linii prostej x 1,3 (zakręty ulic), 4,5 km/h (75 m/min). To szacunek, nie wyznaczona trasa piesza.
export const dojscieMin = (m: number) => Math.max(1, Math.ceil((m * 1.3) / 75));

export function warszawa(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => f.find((x) => x.type === t)!.value;
  const dow = get("weekday");
  const h = +get("hour") % 24, m = +get("minute");
  return { godzina: h, minuta: m, hhmm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, dzien: (dow === "Sat" ? "sa" : dow === "Sun" ? "su" : "wd") as "wd" | "sa" | "su" };
}
const hhmmZ = (sekundy: number) => warszawa(new Date(sekundy * 1000)).hhmm;

const TYP_DNIA = { wd: 5, sa: 6, su: 7 } as const; // indeks tablicy w Wzorzec
const kursyNaGodzine = (w: Wzorzec, dzien: "wd" | "sa" | "su", godz: number) => w[TYP_DNIA[dzien]][godz % 24] as number;
// Średnie oczekiwanie = połowa odstępu między kursami w tej godzinie; brak kursów = linia niedostępna.
// Pociągi mają dokładne odjazdy (czekamy do najbliższego, do 6 h); reszta: średnie oczekiwanie z częstotliwości kursów.
const czekanieMin = (w: Wzorzec, dzien: "wd" | "sa" | "su", minutaDnia: number, pos: number) => {
  const dok = w[8]?.[dzien];
  if (dok) {
    let naj = Infinity;
    for (const s of dok) { const cz = s + w[4][pos] - minutaDnia; if (cz >= 0 && cz < naj) naj = cz; }
    return naj <= 360 ? naj : Infinity;
  }
  const n = kursyNaGodzine(w, dzien, Math.floor(minutaDnia / 60));
  return n > 0 ? Math.min(30, 60 / n / 2) : Infinity;
};
const hhmmMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

const etykieta = (S: Siec, w: Wzorzec) => S.linie[w[0]][2];

// --- przystanki w pobliżu
export function przystankiBlisko(S: Siec, lat: number, lon: number, promien: number, limit: number) {
  const out: { idx: number; m: number }[] = [];
  const dlat = promien / 111_000, dlon = promien / (111_000 * Math.cos((lat * Math.PI) / 180));
  const cLat0 = Math.floor((lat - dlat) / KOMORKA), cLat1 = Math.floor((lat + dlat) / KOMORKA);
  const cLon0 = Math.floor((lon - dlon) / (KOMORKA * 1.55)), cLon1 = Math.floor((lon + dlon) / (KOMORKA * 1.55));
  for (let a = cLat0; a <= cLat1; a++) for (let b = cLon0; b <= cLon1; b++) {
    for (const i of S.siatka.get(`${a},${b}`) ?? []) {
      const p = S.przystanki[i];
      const m = odleglosc(lat, lon, p[3], p[4]);
      if (m <= promien) out.push({ idx: i, m });
    }
  }
  return out.sort((x, y) => x.m - y.m).slice(0, limit);
}

export function liniePrzystanku(S: Siec, idx: number): string[] {
  return [...new Set(S.naPrzystanku[idx].map(([wi]) => etykieta(S, S.wzorce[wi])))].sort((a, b) => a.localeCompare(b, "pl", { numeric: true }));
}

export function opisPrzystanku(S: Siec, idx: number, m?: number) {
  const p = S.przystanki[idx];
  return {
    id: `${p[0]}:${p[1]}`, nazwa: p[2], slupek: p[5] || undefined, rodzaj: FEEDY[p[0]], lat: p[3], lon: p[4],
    ...(m !== undefined ? { odleglosc_m: Math.round(m), dojscie_min: dojscieMin(m) } : {}),
    linie: liniePrzystanku(S, idx),
  };
}

// --- GTFS-RT na żywo
export interface RtKurs { feed: Feed; trip_id: string; route_id?: string; kier?: number; aktualizacje: { stop: number; t: number; opoznienie: number | null }[] }

export async function pobierzTripUpdates(S: Siec, feedy: Feed[]): Promise<{ kursy: RtKurs[]; czas_feedu: Partial<Record<Feed, number>>; bledy: string[] }> {
  const kursy: RtKurs[] = [], czas: Partial<Record<Feed, number>> = {}, bledy: string[] = [];
  await Promise.all(feedy.filter(czyZtp).map(async (f) => {
    try {
      const feed = decodeFeed(await getBytes(`${BAZA_ZTP}/TripUpdates_${f}.pb`));
      czas[f] = feed.header?.timestamp;
      for (const e of feed.entity ?? []) {
        const tu = e.trip_update;
        if (!tu) continue;
        const akt = (tu.stop_time_update ?? []).flatMap((u: any) => {
          const stop = S.idxP.get(`${f}:${u.stop_id}`);
          const ev = u.departure?.time ? u.departure : u.arrival;
          return stop === undefined || !ev?.time ? [] : [{ stop, t: ev.time as number, opoznienie: (ev.delay ?? null) as number | null }];
        });
        if (akt.length) kursy.push({ feed: f, trip_id: tu.trip?.trip_id ?? e.id, route_id: tu.trip?.route_id, kier: tu.trip?.direction_id, aktualizacje: akt });
      }
    } catch (e) { bledy.push(`${f}: ${(e as Error).message}`); }
  }));
  return { kursy, czas_feedu: czas, bledy };
}

// Linia kursu: z route_id (autobusy), a dla tramwajów (brak route_id) po wzorcu zawierającym kolejne przystanki kursu.
export function liniaKursu(S: Siec, k: RtKurs, odPos: number): { numer: string; kierunek: string } | null {
  if (k.route_id !== undefined) {
    const li = S.idxL.get(`${k.feed}:${k.route_id}`);
    if (li !== undefined) {
      const start = k.aktualizacje[odPos].stop;
      const w = S.naPrzystanku[start].map(([wi]) => S.wzorce[wi]).find((x) => x[0] === li && (k.kier === undefined || x[1] === k.kier));
      return { numer: S.linie[li][2], kierunek: w?.[2] ?? "" };
    }
  }
  const kl = S.kursLinia.get(`${k.feed}:${k.trip_id}`);
  if (kl !== undefined) {
    const li = Math.floor(kl / 2), dir = kl % 2;
    const w = S.naPrzystanku[k.aktualizacje[odPos].stop].map(([wi]) => S.wzorce[wi]).find((x) => x[0] === li && x[1] === dir);
    return { numer: S.linie[li][2], kierunek: w?.[2] ?? "" };
  }
  const nastepne = k.aktualizacje.slice(odPos, odPos + 3).map((a) => a.stop);
  for (const [wi, pos] of S.naPrzystanku[nastepne[0]]) {
    const w = S.wzorce[wi];
    if (S.linie[w[0]][0] !== k.feed) continue;
    if (nastepne.every((s, j) => w[3][pos + j] === s)) return { numer: etykieta(S, w), kierunek: w[2] };
  }
  return null;
}

// Odjazdy pociągów z rozkładu (PKP PLK): dokładne godziny, ale bez opóźnień na żywo.
export function odjazdyRozkladowe(S: Siec, idxs: number[], limit: number, teraz = Date.now()) {
  const t = warszawa(new Date(teraz));
  const minuta = t.godzina * 60 + t.minuta;
  const out: { min: number; p: number; numer: string; kierunek: string }[] = [];
  for (const i of idxs) {
    if (S.przystanki[i][0] !== "K") continue;
    for (const [wi, pos] of S.naPrzystanku[i]) {
      const w = S.wzorce[wi], dok = w[8]?.[t.dzien];
      if (!dok || pos === w[3].length - 1) continue; // na ostatnim przystanku pociąg kończy bieg
      for (const s of dok) { const dep = s + w[4][pos]; if (dep >= minuta - 1) out.push({ min: dep, p: i, numer: etykieta(S, w), kierunek: w[2] }); }
    }
  }
  return out.sort((a, b) => a.min - b.min).slice(0, limit).map((o) => ({
    linia: o.numer, kierunek: o.kierunek, przystanek: `${S.przystanki[o.p][2]}${S.przystanki[o.p][5] ? " " + S.przystanki[o.p][5] : ""}`,
    odjazd: hhmmMin(o.min), za_min: Math.max(0, Math.round(o.min - minuta)), opoznienie_s: null as number | null, zrodlo: "rozkład PKP PLK (bez danych na żywo)",
  }));
}

export async function odjazdyZPrzystankow(S: Siec, idxs: number[], limit: number, teraz = Date.now()) {
  const feedy = [...new Set(idxs.map((i) => S.przystanki[i][0]))];
  const zbior = new Set(idxs);
  const { kursy, czas_feedu, bledy } = await pobierzTripUpdates(S, feedy);
  const nowSek = teraz / 1000;
  const wyniki: { t: number; p: number; numer: string; kierunek: string; opoznienie: number | null }[] = [];
  for (const k of kursy) {
    k.aktualizacje.forEach((a, pos) => {
      if (!zbior.has(a.stop) || a.t < nowSek - 30) return;
      const l = liniaKursu(S, k, pos);
      wyniki.push({ t: a.t, p: a.stop, numer: l?.numer ?? "?", kierunek: l?.kierunek ?? "", opoznienie: a.opoznienie });
    });
  }
  wyniki.sort((a, b) => a.t - b.t);
  const naZywo = wyniki.slice(0, limit).map((w) => ({
    linia: w.numer, kierunek: w.kierunek, przystanek: `${S.przystanki[w.p][2]}${S.przystanki[w.p][5] ? " " + S.przystanki[w.p][5] : ""}`,
    odjazd: hhmmZ(w.t), za_min: Math.max(0, Math.round((w.t - nowSek) / 60)), opoznienie_s: w.opoznienie, zrodlo: "GTFS-RT (na żywo)",
  }));
  const rozklad = odjazdyRozkladowe(S, idxs, limit, teraz);
  return { bledy, czas_feedu, odjazdy: [...naZywo, ...rozklad].sort((a, b) => a.za_min - b.za_min).slice(0, limit) };
}

// --- planer
export interface Punkt { lat: number; lon: number }
interface Noga { linia: string; kierunek: string; wsiadanie: string; wysiadanie: string; przystankow: number; jazda_min: number; wsiadanie_idx: number; wysiadanie_idx: number; wzorzec: number; odjazd_wg_rozkladu?: string }
export interface Opcja {
  rodzaj: "bezposrednia" | "z przesiadką";
  czas_min: number;
  dojscie_start: { przystanek: string; m: number; min: number; zrodlo: string };
  nogi: Noga[];
  przesiadka?: { przystanek: string; dojscie_min: number };
  dojscie_cel: { przystanek: string; m: number; min: number; zrodlo: string };
  czekanie_min: number;
  czekanie_pierwsza_noga_min: number;
  zrodlo_czasu: string;
}

const PRZESIADKA_PROMIEN = 200;
const BUFOR_PRZESIADKI_MIN = 3;

// Kandydat na przystanek wsiadania/wysiadania: odległość i czas dojścia (z OSM albo szacunek).
export interface Kand { idx: number; m: number; min: number; zrodlo: string }

export function planuj(S: Siec, kz: Kand[], kd: Kand[], opt: { teraz?: Date } = {}): Opcja[] {
  const teraz = warszawa(opt.teraz ?? new Date());
  const minutaTeraz = teraz.godzina * 60 + teraz.minuta;
  if (!kz.length || !kd.length) return [];
  const celem = new Map(kd.map((x) => [x.idx, x]));
  const nazwaP = (i: number) => S.przystanki[i][2] + (S.przystanki[i][5] ? ` ${S.przystanki[i][5]}` : "");
  const noga = (wi: number, a: number, b: number, odjMin?: number): Noga => {
    const w = S.wzorce[wi];
    return { linia: etykieta(S, w), kierunek: w[2], wsiadanie: nazwaP(w[3][a]), wysiadanie: nazwaP(w[3][b]), przystankow: b - a, jazda_min: Math.max(1, w[4][b] - w[4][a]), wsiadanie_idx: w[3][a], wysiadanie_idx: w[3][b], wzorzec: wi, ...(w[8] && odjMin !== undefined ? { odjazd_wg_rozkladu: hhmmMin(odjMin) } : {}) };
  };

  // 1) linie bezpośrednie
  const naj = new Map<string, Opcja>();
  for (const s of kz) for (const [wi, pos] of S.naPrzystanku[s.idx]) {
    const w = S.wzorce[wi];
    const cz = czekanieMin(w, teraz.dzien, minutaTeraz + s.min, pos);
    if (!isFinite(cz)) continue;
    for (let j = pos + 1; j < w[3].length; j++) {
      const kk = celem.get(w[3][j]);
      if (!kk) continue;
      const jazda = Math.max(1, w[4][j] - w[4][pos]);
      const czas = s.min + cz + jazda + kk.min;
      const klucz = `${etykieta(S, w)}|${w[2]}`;
      if (!naj.has(klucz) || naj.get(klucz)!.czas_min > czas) {
        naj.set(klucz, {
          rodzaj: "bezposrednia", czas_min: Math.round(czas),
          dojscie_start: { przystanek: nazwaP(s.idx), m: Math.round(s.m), min: s.min, zrodlo: s.zrodlo },
          nogi: [noga(wi, pos, j, minutaTeraz + s.min + cz)], dojscie_cel: { przystanek: nazwaP(w[3][j]), m: Math.round(kk.m), min: kk.min, zrodlo: kk.zrodlo },
          czekanie_min: Math.round(cz), czekanie_pierwsza_noga_min: Math.round(cz), zrodlo_czasu: w[8] ? "rozkład pociągu (dokładny odjazd)" : "szacunek z rozkładu (częstotliwość kursów)",
        });
      }
      break; // pierwszy przystanek docelowy na tym wzorcu wystarczy
    }
  }
  const bezposrednie = [...naj.values()].sort((a, b) => a.czas_min - b.czas_min);

  // 2) jedna przesiadka: indeks "z którego przystanku (blisko celu) można dojechać do przystanku docelowego"
  const wDol = new Map<number, { wi: number; k: number; l: number; kd: Kand }[]>();
  for (const s of kd) for (const [wi, l] of S.naPrzystanku[s.idx]) {
    const w = S.wzorce[wi];
    if (!isFinite(czekanieMin(w, teraz.dzien, minutaTeraz, 0))) continue;
    for (let k = 0; k < l; k++) (wDol.get(w[3][k]) ?? wDol.set(w[3][k], []).get(w[3][k])!).push({ wi, k, l, kd: s });
  }
  const przes = new Map<string, Opcja>();
  for (const s of kz) for (const [wi, pos] of S.naPrzystanku[s.idx]) {
    const w = S.wzorce[wi];
    const cz1 = czekanieMin(w, teraz.dzien, minutaTeraz + s.min, pos);
    if (!isFinite(cz1)) continue;
    for (let j = pos + 1; j < w[3].length; j++) {
      const s1 = w[3][j];
      const p1 = S.przystanki[s1];
      const sasiedzi: number[] = [];
      const ca = Math.floor(p1[3] / KOMORKA), cb = Math.floor(p1[4] / (KOMORKA * 1.55));
      for (let a = ca - 1; a <= ca + 1; a++) for (let b = cb - 1; b <= cb + 1; b++) for (const n of S.siatka.get(`${a},${b}`) ?? []) sasiedzi.push(n);
      for (const n of sasiedzi) {
        const mt = n === s1 ? 0 : odleglosc(p1[3], p1[4], S.przystanki[n][3], S.przystanki[n][4]);
        if (mt > PRZESIADKA_PROMIEN) continue;
        for (const e of wDol.get(n) ?? []) {
          const w2 = S.wzorce[e.wi];
          if (w2[0] === w[0]) continue;
          const jazda1 = Math.max(1, w[4][j] - w[4][pos]), jazda2 = Math.max(1, w2[4][e.l] - w2[4][e.k]);
          const dojT = mt ? dojscieMin(mt) : 0;
          const naPrzesiadce = minutaTeraz + s.min + cz1 + jazda1 + dojT + BUFOR_PRZESIADKI_MIN;
          const cz2 = czekanieMin(w2, teraz.dzien, naPrzesiadce, e.k);
          if (!isFinite(cz2)) continue;
          const czas = s.min + cz1 + jazda1 + dojT + BUFOR_PRZESIADKI_MIN + cz2 + jazda2 + e.kd.min;
          const klucz = `${etykieta(S, w)}|${w[2]}|${etykieta(S, w2)}|${w2[2]}`;
          if (!przes.has(klucz) || przes.get(klucz)!.czas_min > czas) {
            przes.set(klucz, {
              rodzaj: "z przesiadką", czas_min: Math.round(czas),
              dojscie_start: { przystanek: nazwaP(s.idx), m: Math.round(s.m), min: s.min, zrodlo: s.zrodlo },
              nogi: [noga(wi, pos, j, minutaTeraz + s.min + cz1), noga(e.wi, e.k, e.l, naPrzesiadce + cz2)],
              przesiadka: { przystanek: nazwaP(s1), dojscie_min: dojT },
              dojscie_cel: { przystanek: nazwaP(w2[3][e.l]), m: Math.round(e.kd.m), min: e.kd.min, zrodlo: e.kd.zrodlo },
              czekanie_min: Math.round(cz1 + cz2), czekanie_pierwsza_noga_min: Math.round(cz1), zrodlo_czasu: w[8] || w2[8] ? "rozkład pociągu (dokładny odjazd) i szacunek dla pozostałych linii" : "szacunek z rozkładu (częstotliwość kursów)",
            });
          }
        }
      }
    }
  }
  const zPrzesiadka = [...przes.values()].sort((a, b) => a.czas_min - b.czas_min);
  // Pokazujemy najlepsze bezpośrednie i najlepsze z przesiadką (przesiadkowe tylko, gdy realnie krótsze albo brak bezpośrednich).
  const najlepszaBezp = bezposrednie[0]?.czas_min ?? Infinity;
  const wybrane = [...bezposrednie.slice(0, 4), ...zPrzesiadka.filter((o) => o.czas_min < najlepszaBezp - 3).slice(0, 3)];
  if (!bezposrednie.length) wybrane.push(...zPrzesiadka.slice(0, 4));
  return wybrane.sort((a, b) => a.czas_min - b.czas_min);
}

// Uzupełnia opcje o czasy z GTFS-RT dla pierwszej nogi: pierwsze kursy, które jadą z przystanku wsiadania do wysiadania.
export async function uzupelnijNaZywo(S: Siec, opcje: Opcja[], teraz = Date.now()) {
  if (!opcje.length) return { bledy: [] as string[], czas_feedu: {} };
  const feedy = [...new Set(opcje.map((o) => S.przystanki[o.nogi[0].wsiadanie_idx][0]))].filter(czyZtp);
  if (!feedy.length) return { bledy: [] as string[], czas_feedu: {} };
  const { kursy, czas_feedu, bledy } = await pobierzTripUpdates(S, feedy);
  const nowSek = teraz / 1000;
  for (const o of opcje) {
    const n = o.nogi[0];
    if (!czyZtp(S.przystanki[n.wsiadanie_idx][0])) continue; // pociągi: rozkład, bez danych na żywo
    const dojdz = nowSek + o.dojscie_start.min * 60;
    const trafione: { dep: number; arr: number; opoz: number | null }[] = [];
    for (const k of kursy) {
      const a = k.aktualizacje.findIndex((x) => x.stop === n.wsiadanie_idx && x.t >= dojdz - 20);
      if (a < 0) continue;
      const b = k.aktualizacje.findIndex((x, i) => i > a && x.stop === n.wysiadanie_idx);
      if (b < 0) continue;
      const l = liniaKursu(S, k, a);
      if (l && l.numer !== n.linia) continue; // ta sama para przystanków, ale inna linia
      trafione.push({ dep: k.aktualizacje[a].t, arr: k.aktualizacje[b].t, opoz: k.aktualizacje[a].opoznienie });
    }
    trafione.sort((x, y) => x.dep - y.dep);
    if (trafione.length) {
      const t = trafione[0];
      const czekanie = Math.max(0, (t.dep - dojdz) / 60), jazda = (t.arr - t.dep) / 60;
      (o as any).najblizsze_odjazdy_na_zywo = trafione.slice(0, 3).map((x) => ({ odjazd: hhmmZ(x.dep), za_min: Math.max(0, Math.round((x.dep - nowSek) / 60)), opoznienie_s: x.opoz }));
      o.czas_min = Math.round(o.czas_min - o.czekanie_pierwsza_noga_min - n.jazda_min + czekanie + jazda);
      o.czekanie_min = Math.round(o.czekanie_min - o.czekanie_pierwsza_noga_min + czekanie);
      o.czekanie_pierwsza_noga_min = Math.round(czekanie);
      n.jazda_min = Math.round(jazda);
      o.zrodlo_czasu = "pierwsza noga z GTFS-RT (na żywo), reszta szacunek z rozkładu";
    }
  }
  opcje.sort((a, b) => a.czas_min - b.czas_min);
  return { bledy, czas_feedu };
}

// Kandydaci z samym szacunkiem dojścia (linia prosta x 1,3).
export function kandydaciSzacunek(S: Siec, p: Punkt, maxM: number, limit: number): Kand[] {
  return przystankiBlisko(S, p.lat, p.lon, maxM, limit).map((x) => ({ idx: x.idx, m: x.m, min: dojscieMin(x.m), zrodlo: "szacunek (linia prosta x1,3)" }));
}
