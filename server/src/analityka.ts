// Analityka deterministyczna dla narzędzi: dzielnice (granice, ludność wg wieku), siatka Hex 100 m, statystyka opisowa,
// korelacja, nierówności, klasy, wzrost i pokrycie ludności usługami. Wszystko liczy serwer, żeby model nie przeliczał w pamięci.
// Migawki w data/*.json buduje scripts/build-analityka.mjs (MSIP); stan i źródło są zwracane razem z wynikiem.
import dzielniceDane from "../data/dzielnice.json" with { type: "json" };
import ludnoscDane from "../data/ludnosc-dzielnic.json" with { type: "json" };
import hexDane from "../data/hex100.json" with { type: "json" };
import { bbox, metry, wObszarze, type Ring } from "./geo.ts";

// ───────────── dzielnice

export const RZYMSKIE = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"];
export interface Dzielnica { id: number; rzym: string; nazwa: string; pelna: string; rings: Ring[]; b: [number, number, number, number] }

export const DZIELNICE: Dzielnica[] = (dzielniceDane.dzielnice as { id: number; nazwa: string; rings: Ring[] }[]).map((d) => ({
  id: d.id, rzym: RZYMSKIE[d.id - 1], pelna: d.nazwa, nazwa: d.nazwa.replace(/^Dzielnica\s+[IVXL]+\s+/, ""), rings: d.rings, b: bbox(d.rings),
}));

const bezOgonkow = (s: string) => s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** „VIII Dębniki”, „Dzielnica VIII”, „Dębniki”, 8, „8” → numer dzielnicy (1–18) albo null. */
export function dzielnicaId(wartosc: unknown): number | null {
  if (typeof wartosc === "number") return wartosc >= 1 && wartosc <= 18 && Number.isInteger(wartosc) ? wartosc : null;
  const t = bezOgonkow(String(wartosc ?? "")).replace(/^dzielnica\s+/, "");
  if (!t) return null;
  if (/^\d{1,2}$/.test(t)) return dzielnicaId(+t);
  const rzym = t.match(/^(xviii|xvii|xvi|xv|xiv|xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/)?.[1];
  if (rzym) return RZYMSKIE.indexOf(rzym.toUpperCase()) + 1;
  const pelne = DZIELNICE.map((d) => ({ d, n: bezOgonkow(d.nazwa) }));
  const dokladna = pelne.find((x) => x.n === t);
  if (dokladna) return dokladna.d.id;
  const pasujace = pelne.filter((x) => (t.length >= 4 && x.n.startsWith(t)) || t.includes(x.n));
  return pasujace.length === 1 ? pasujace[0].d.id : null;
}

export const dzielnica = (id: number): Dzielnica => DZIELNICE[id - 1];

export function dzielnicaPunktu(lat: number, lon: number): number | null {
  const d = DZIELNICE.find((x) => lon >= x.b[0] && lon <= x.b[2] && lat >= x.b[1] && lat <= x.b[3] && wObszarze(lon, lat, x.rings));
  return d?.id ?? null;
}

// ───────────── ludność dzielnic wg wieku (zameldowani na pobyt stały), szereg miesięczny

export type PoleLudnosci = "r_ogolem" | "k_ogolem" | "m_ogolem" | "r_0_2" | "r_3_6" | "r_7_14" | "r_15_18" | "r_19_24" | "r_25_34" | "r_35_44" | "r_45_59_64" | "r_60_65_79" | "r_po_80";
const POLA_L = ludnoscDane.pola as string[];
const WIERSZE_L = ludnoscDane.wiersze as (string | number)[][];
export const DATY_LUDNOSCI: string[] = [...new Set(WIERSZE_L.map((w) => w[1] as string))].sort();
export const OSTATNIA_DATA = DATY_LUDNOSCI[DATY_LUDNOSCI.length - 1];
const indeksPola = (p: string) => POLA_L.indexOf(p);

export function ludnosc(id: number, pole: PoleLudnosci = "r_ogolem", data = OSTATNIA_DATA): number | null {
  const w = WIERSZE_L.find((x) => x[0] === id && x[1] === data);
  return w ? (w[indeksPola(pole)] as number) : null;
}
/** Szereg miesięczny jednego pola ludności dla dzielnicy (id) albo dla całego miasta (id = 0). */
export function szeregLudnosci(id: number, pole: PoleLudnosci = "r_ogolem"): { data: string; wartosc: number }[] {
  return DATY_LUDNOSCI.map((data) => ({ data, wartosc: id === 0 ? DZIELNICE.reduce((a, d) => a + (ludnosc(d.id, pole, data) ?? 0), 0) : (ludnosc(id, pole, data) ?? 0) }));
}
export const ZRODLO_LUDNOSCI = `${ludnoscDane.zrodlo}, stan na ${OSTATNIA_DATA}`;

// ───────────── siatka Hex 100 m

export interface Hex { lon: number; lat: number; lud: number; strefa: number; mSzkola: number; mZiel3: number; mZiel15: number; dz: number }
let hexCache: Hex[] | null = null;
export function hexy(): Hex[] {
  return (hexCache ??= (hexDane.hexy as number[][]).map((h) => ({ lon: h[0], lat: h[1], lud: h[2], strefa: h[3], mSzkola: h[4], mZiel3: h[5], mZiel15: h[6], dz: dzielnicaPunktu(h[1], h[0]) ?? 0 })));
}
export const HEX_STAN = hexDane.stan as string;
export const ZRODLO_HEX = `${hexDane.zrodlo}, stan na ${HEX_STAN}`;
export const LUDNOSC_MIASTA = () => hexy().reduce((a, h) => a + h.lud, 0);

/** Standardy dostępności z projektu planu ogólnego Krakowa (warstwa „Obszar standardów dostępności infrastruktury społecznej”). */
export const STANDARDY = {
  1: { nazwa: "Obszar Intensywny", szkola_m: 1000, zielen3_m: 500, zielen15_m: 2000 },
  2: { nazwa: "Obszar Ekstensywny", szkola_m: 2500, zielen3_m: 500, zielen15_m: 3000 },
} as const;
/** Przelicznik odległości w linii prostej na drogę dojścia pieszo (ustawa liczy drogę dojścia, nie linię prostą). */
export const WSPOLCZYNNIK_DROGI = 1.3;

// ───────────── pokrycie usługami

export interface PunktUslugi { lat: number; lon: number; nazwa?: string }
export interface WynikPokrycia {
  promien_m: number; razem: number; w_zasiegu: number; udzial: number;
  wg_dzielnic: { id: number; nazwa: string; razem: number; w_zasiegu: number; udzial: number }[];
  biale_plamy: { lat: number; lon: number; bez_dostepu: number; dzielnica: string; najblizsza_m: number | null }[];
}

/** Ludność (siatka Hex 100 m) w zasięgu `promien_m` (w linii prostej) od najbliższego z punktów usługi, z podziałem na dzielnice i białymi plamami. */
export function pokrycie(punkty: PunktUslugi[], promien_m: number, topPlam = 8): WynikPokrycia {
  const H = hexy();
  const kosz = new Map<string, { s: number; sx: number; sy: number; lud: number; dz: Map<number, number>; min: number }>();
  const wg = new Map<number, { razem: number; ok: number }>(DZIELNICE.map((d) => [d.id, { razem: 0, ok: 0 }]));
  let razem = 0, ok = 0;
  for (const h of H) {
    let min = Infinity;
    for (const p of punkty) { const d = metry(h.lat, h.lon, p.lat, p.lon); if (d < min) min = d; }
    const w = wg.get(h.dz) ?? wg.set(h.dz, { razem: 0, ok: 0 }).get(h.dz)!;
    razem += h.lud; w.razem += h.lud;
    if (min <= promien_m) { ok += h.lud; w.ok += h.lud; continue; }
    // niepokryte hexy grupujemy w komórki ok. 500 m, żeby wskazać obszary z największym brakiem dostępu
    const k = `${Math.floor(h.lat / 0.0045)},${Math.floor(h.lon / 0.007)}`;
    const c = kosz.get(k) ?? kosz.set(k, { s: 0, sx: 0, sy: 0, lud: 0, dz: new Map(), min: Infinity }).get(k)!;
    c.lud += h.lud; c.sx += h.lon * h.lud; c.sy += h.lat * h.lud; c.min = Math.min(c.min, min); c.dz.set(h.dz, (c.dz.get(h.dz) ?? 0) + h.lud);
  }
  const biale = [...kosz.values()].filter((c) => c.lud > 0).sort((a, b) => b.lud - a.lud).slice(0, topPlam).map((c) => {
    const dz = [...c.dz.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { lat: +(c.sy / c.lud).toFixed(5), lon: +(c.sx / c.lud).toFixed(5), bez_dostepu: c.lud, dzielnica: dz ? dzielnica(dz).nazwa : "poza dzielnicami", najblizsza_m: Number.isFinite(c.min) ? Math.round(c.min) : null };
  });
  return {
    promien_m, razem, w_zasiegu: ok, udzial: razem ? ok / razem : 0,
    wg_dzielnic: [...wg.entries()].filter(([id]) => id > 0).map(([id, v]) => ({ id, nazwa: dzielnica(id).nazwa, razem: v.razem, w_zasiegu: v.ok, udzial: v.razem ? v.ok / v.razem : 0 })),
    biale_plamy: biale,
  };
}

// ───────────── statystyka opisowa

const liczby = (x: (number | null | undefined)[]) => x.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
export const suma = (x: number[]) => x.reduce((a, b) => a + b, 0);
export const srednia = (x: number[]) => (x.length ? suma(x) / x.length : NaN);

/** Kwantyl metodą interpolacji liniowej (jak w Excelu PERCENTILE.INC); `x` musi być posortowane rosnąco. */
export function kwantyl(posortowane: number[], p: number): number {
  if (!posortowane.length) return NaN;
  const poz = (posortowane.length - 1) * p, d = Math.floor(poz), g = Math.ceil(poz);
  return posortowane[d] + (posortowane[g] - posortowane[d]) * (poz - d);
}

export function odchylenie(x: number[], zPopulacji = false): number {
  if (x.length < 2) return NaN;
  const m = srednia(x);
  return Math.sqrt(suma(x.map((v) => (v - m) ** 2)) / (x.length - (zPopulacji ? 0 : 1)));
}

export interface Opis { n: number; suma: number; srednia: number; mediana: number; odchylenie: number; wspolczynnik_zmiennosci: number | null; min: number; q1: number; q3: number; max: number; p10: number; p90: number; skosnosc: number | null }
export function opis(wartosci: (number | null | undefined)[]): Opis {
  const x = liczby(wartosci), s = x.slice().sort((a, b) => a - b);
  const m = srednia(x), sd = odchylenie(x);
  const n = x.length;
  const skos = n > 2 && sd > 0 ? (n / ((n - 1) * (n - 2))) * suma(x.map((v) => ((v - m) / sd) ** 3)) : null;
  return { n, suma: suma(x), srednia: m, mediana: kwantyl(s, 0.5), odchylenie: sd, wspolczynnik_zmiennosci: m ? sd / Math.abs(m) : null, min: s[0], q1: kwantyl(s, 0.25), q3: kwantyl(s, 0.75), max: s[n - 1], p10: kwantyl(s, 0.1), p90: kwantyl(s, 0.9), skosnosc: skos };
}

/** Współczynnik Giniego (0 = równo, 1 = cała wartość u jednej jednostki) i udział górnych 10% w sumie. Dla wartości nieujemnych. */
export function nierownosc(wartosci: number[]) {
  const x = liczby(wartosci).filter((v) => v >= 0).sort((a, b) => a - b), n = x.length, s = suma(x);
  if (n < 2 || s === 0) return { n, gini: null as number | null, udzial_top10: null as number | null, krzywa_lorenza: [] as { udzial_jednostek: number; udzial_sumy: number }[] };
  let wazona = 0;
  x.forEach((v, i) => { wazona += (i + 1) * v; });
  const gini = (2 * wazona) / (n * s) - (n + 1) / n;
  const top = Math.max(1, Math.ceil(n * 0.1));
  let kum = 0;
  const lorenz = [{ udzial_jednostek: 0, udzial_sumy: 0 }, ...x.map((v, i) => ({ udzial_jednostek: (i + 1) / n, udzial_sumy: (kum += v) / s }))];
  return { n, gini, udzial_top10: suma(x.slice(-top)) / s, krzywa_lorenza: lorenz };
}

const rangi = (x: number[]): number[] => {
  const idx = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(x.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; // rangi uśrednione przy remisach
    i = j + 1;
  }
  return r;
};

// Dystrybuanta rozkładu normalnego (przybliżenie Abramowitza-Stegun 7.1.26) i t-Studenta przez rozkład normalny dla n > 30,
// a dla małych prób przez regularyzowaną niepełną funkcję beta: wystarcza do przybliżonej wartości p przy ocenie korelacji.
const phi = (z: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp((-z * z) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
function lnGamma(z: number): number { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, x = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const cj of c) s += cj / ++y; return -t + Math.log((2.5066282746310005 * s) / x); }
function betaCf(a: number, b: number, x: number): number { const tiny = 1e-30; let c = 1, d = 1 - ((a + b) * x) / (a + 1); if (Math.abs(d) < tiny) d = tiny; d = 1 / d; let h = d; for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c; aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1)); d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
const betaI = (a: number, b: number, x: number) => { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? (bt * betaCf(a, b, x)) / a : 1 - (bt * betaCf(b, a, 1 - x)) / b; };
/** Dwustronna wartość p dla statystyki t o `df` stopniach swobody. */
export const pT = (t: number, df: number) => (df > 0 ? betaI(df / 2, 0.5, df / (df + t * t)) : NaN);

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;
  const mx = srednia(x.slice(0, n)), my = srednia(y.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/** Korelacja Pearsona i Spearmana dla par bez braków, z wartością p (przybliżoną) i opisem siły związku. Korelacja to nie przyczynowość. */
export function korelacja(x: (number | null | undefined)[], y: (number | null | undefined)[]) {
  const pary: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (typeof x[i] === "number" && typeof y[i] === "number" && Number.isFinite(x[i]) && Number.isFinite(y[i])) pary.push([x[i] as number, y[i] as number]);
  const a = pary.map((p) => p[0]), b = pary.map((p) => p[1]), n = pary.length;
  const r = pearson(a, b), rho = pearson(rangi(a), rangi(b));
  const p = (v: number) => (n > 2 && Number.isFinite(v) && Math.abs(v) < 1 ? pT((v * Math.sqrt(n - 2)) / Math.sqrt(1 - v * v), n - 2) : Math.abs(v) === 1 ? 0 : NaN);
  const sila = (v: number) => (Math.abs(v) >= 0.7 ? "silna" : Math.abs(v) >= 0.4 ? "umiarkowana" : Math.abs(v) >= 0.2 ? "słaba" : "bardzo słaba lub brak");
  const nachylenie = sxx(a) ? (pearson(a, b) * odchylenie(b)) / odchylenie(a) : NaN;
  return { n, pearson: r, p_pearson: p(r), spearman: rho, p_spearman: p(rho), sila: sila(rho), kierunek: rho > 0 ? "dodatnia" : rho < 0 ? "ujemna" : "brak", nachylenie, wyraz_wolny: srednia(b) - nachylenie * srednia(a), r2: r * r };
}
const sxx = (x: number[]) => odchylenie(x);

/** Test trendu Manna-Kendalla (bez założeń o rozkładzie) i nachylenie Sena. Dla szeregów czasowych o ≥ 4 punktach. */
export function trend(x: number[]) {
  const n = x.length;
  if (n < 4) return { n, kierunek: "za krótki szereg", s: null as number | null, p: null as number | null, nachylenie_sena: null as number | null };
  let s = 0;
  const nach: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { s += Math.sign(x[j] - x[i]); nach.push((x[j] - x[i]) / (j - i)); }
  const wariancja = (n * (n - 1) * (2 * n + 5)) / 18; // bez poprawki na remisy
  const z = s > 0 ? (s - 1) / Math.sqrt(wariancja) : s < 0 ? (s + 1) / Math.sqrt(wariancja) : 0;
  const p = 2 * (1 - phi(Math.abs(z)));
  const sorted = nach.sort((a, b) => a - b);
  return { n, kierunek: p < 0.05 ? (s > 0 ? "rosnący" : "malejący") : "brak istotnego trendu", s, p, nachylenie_sena: kwantyl(sorted, 0.5) };
}

/** Zmiana między pierwszą a ostatnią wartością: bezwzględna, procentowa i średnioroczna (CAGR) dla `lata` lat. */
export function wzrost(pierwsza: number, ostatnia: number, lata: number) {
  return { zmiana: ostatnia - pierwsza, zmiana_proc: pierwsza ? ((ostatnia - pierwsza) / Math.abs(pierwsza)) * 100 : null, cagr_proc: pierwsza > 0 && ostatnia > 0 && lata > 0 ? ((ostatnia / pierwsza) ** (1 / lata) - 1) * 100 : null };
}

/** Wartości odstające: z-score (|z| > 3 lub próg użytkownika) oraz reguła IQR (poza q1−1,5·IQR i q3+1,5·IQR). */
export function odstajace(x: number[], progZ = 3) {
  const o = opis(x), iqr = o.q3 - o.q1, dol = o.q1 - 1.5 * iqr, gora = o.q3 + 1.5 * iqr;
  return x.map((v, i) => ({ i, wartosc: v, z: o.odchylenie ? (v - o.srednia) / o.odchylenie : 0 })).filter((p) => Math.abs(p.z) > progZ || p.wartosc < dol || p.wartosc > gora).map((p) => ({ ...p, regula: Math.abs(p.z) > progZ ? "z-score" : "IQR" }));
}

/** Granice klas dla mapy i wykresów: kwantylowe albo równe przedziały; zwraca k+1 granic. */
export function granice(wartosci: number[], k: number, metoda: "kwantyle" | "rowne" | "jenks" = "kwantyle"): number[] {
  const s = liczby(wartosci).sort((a, b) => a - b);
  if (!s.length) return [];
  if (metoda === "rowne") return Array.from({ length: k + 1 }, (_, i) => s[0] + ((s[s.length - 1] - s[0]) * i) / k);
  if (metoda === "jenks") return jenks(s, k);
  return Array.from({ length: k + 1 }, (_, i) => kwantyl(s, i / k));
}

// Naturalne przerwy Jenksa (minimalizacja wariancji w klasach), programowanie dynamiczne O(k·n²); dla n ≤ 400 wystarcza.
function jenks(s: number[], k: number): number[] {
  const n = s.length;
  if (n <= k) return [s[0], ...s];
  const K = Math.min(k, n);
  const sk = Array.from({ length: n + 1 }, () => new Array<number>(K + 1).fill(Infinity)), gr = Array.from({ length: n + 1 }, () => new Array<number>(K + 1).fill(0));
  const p1 = [0], p2 = [0];
  for (let i = 0; i < n; i++) { p1.push(p1[i] + s[i]); p2.push(p2[i] + s[i] * s[i]); }
  const koszt = (a: number, b: number) => { const m = b - a; return p2[b] - p2[a] - (p1[b] - p1[a]) ** 2 / m; };
  for (let i = 1; i <= n; i++) sk[i][1] = koszt(0, i);
  for (let j = 2; j <= K; j++) for (let i = j; i <= n; i++) for (let l = j - 1; l < i; l++) { const c = sk[l][j - 1] + koszt(l, i); if (c < sk[i][j]) { sk[i][j] = c; gr[i][j] = l; } }
  const granice: number[] = [s[n - 1]];
  let i = n;
  for (let j = K; j >= 2; j--) { i = gr[i][j]; granice.unshift(s[i - 1]); } // górna granica poprzedniej klasy
  granice.unshift(s[0]);
  return granice;
}

export const klasaWartosci = (v: number, g: number[]): number => { for (let i = 1; i < g.length; i++) if (v <= g[i]) return i - 1; return g.length - 2; };

/** Przypisuje miejsca (1 = największa wartość) z remisami o tym samym numerze. */
export function miejsca(wartosci: number[]): number[] {
  const s = wartosci.slice().sort((a, b) => b - a);
  return wartosci.map((v) => s.indexOf(v) + 1);
}
