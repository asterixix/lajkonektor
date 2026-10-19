// OpenStreetMap: geokodowanie nazw miejsc (Nominatim) i czasy dojścia pieszo (OSRM, profil foot).
// Usługi publiczne mają limity uczciwego użycia, więc pytamy oszczędnie: 1 zapytanie geokodujące na miejsce
// i jedno zapytanie "table" na całą trasę (start i cel razem) o kilku najbliższych przystankach.
import type { Kand, Punkt, Siec } from "./transport.ts";
import { dojscieMin, przystankiBlisko } from "./transport.ts";

const UA = "lajkonektor/0.4 (+https://lajkonektor.sendyka.workers.dev)";
// Ramki (zach, pln, wsch, pld): najpierw sam Kraków, potem Małopolska (gminy aglomeracji i okolice stacji kolejowych).
const VIEWBOX = "19.78,50.13,20.13,49.95";
const VIEWBOX_REGION = "18.9,50.5,21.5,49.2";
const SZACUNEK = "szacunek (linia prosta x1,3)";
const OSRM = "OSM (OSRM, pieszo)";

async function nominatim(q: string, viewbox: string) {
  const p = new URLSearchParams({ q, format: "jsonv2", limit: "1", countrycodes: "pl", viewbox, bounded: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const j: any[] = await res.json();
  return j[0] ? { lat: +j[0].lat, lon: +j[0].lon, nazwa: String(j[0].display_name).split(",").slice(0, 3).join(",") } : null;
}

// Najpierw w Krakowie (nazwa bez miasta znaczy Kraków), a gdy tam nic nie ma, w całej Małopolsce (np. „Staniątki 15”, „Niepołomice rynek”).
export async function geokodujOsm(tekst: string): Promise<{ lat: number; lon: number; nazwa: string } | null> {
  return (await nominatim(`${tekst}, Kraków`, VIEWBOX)) ?? (await nominatim(tekst, VIEWBOX_REGION));
}

type Dojscie = { m: number; min: number };

// Macierz pieszych czasów i odległości: wybrane źródła -> wszystkie cele, jednym zapytaniem (z jednym ponowieniem).
async function tabelaPieszo(punkty: Punkt[], zrodla: number[], cele: number[]): Promise<{ sek: (number | null)[][]; m: (number | null)[][] } | null> {
  const coords = punkty.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const url = `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coords}?sources=${zrodla.join(";")}&destinations=${cele.join(";")}&annotations=duration,distance`;
  for (let proba = 0; proba < 2; proba++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;
      const j: any = await res.json();
      if (j.code === "Ok") return { sek: j.durations, m: j.distances };
    } catch { /* ponowienie */ }
  }
  return null;
}

// Stacje kolejowe liczymy z większego zasięgu niż przystanki: pociąg bywa dużo szybszy, więc warto do niego dojść dalej.
const ZASIEG_STACJI_M = 3000;
const MAX_STACJI = 3;

// Do OSRM trafia tylko kilka najbliższych przystanków (różne nazwy), nie cała sieć.
function wyroznione(S: Siec, p: Punkt, maxM: number, limit: number, stacje = false) {
  const widziane = new Set<string>();
  const podstawowe = przystankiBlisko(S, p.lat, p.lon, maxM, 80).filter((x) => {
    const k = `${S.przystanki[x.idx][0]}|${S.przystanki[x.idx][2]}`;
    if (widziane.has(k) || widziane.size >= limit) return false;
    widziane.add(k);
    return true;
  }).concat(
    // słupki o tej samej nazwie (inne kierunki) dokładamy po wyborze nazw, bo mają różne linie
    przystankiBlisko(S, p.lat, p.lon, maxM, 80).filter((x) => widziane.has(`${S.przystanki[x.idx][0]}|${S.przystanki[x.idx][2]}`)),
  ).filter((x, i, a) => a.findIndex((y) => y.idx === x.idx) === i).slice(0, limit * 3);
  if (!stacje) return podstawowe;
  const nazwyStacji = new Set<string>();
  const stacjeBlisko = przystankiBlisko(S, p.lat, p.lon, ZASIEG_STACJI_M, 400).filter((x) => S.przystanki[x.idx][0] === "K");
  for (const x of stacjeBlisko) if (nazwyStacji.size < MAX_STACJI) nazwyStacji.add(S.przystanki[x.idx][2]);
  const dodatkowe = stacjeBlisko.filter((x) => nazwyStacji.has(S.przystanki[x.idx][2]) && !podstawowe.some((y) => y.idx === x.idx)).slice(0, 12);
  return [...podstawowe, ...dodatkowe];
}

function naKand(S: Siec, bliskie: { idx: number; m: number }[], d: (Dojscie | null)[] | null, maxM: number): Kand[] {
  return bliskie.flatMap((x, i) => {
    const o = d?.[i];
    if (!o || Number.isNaN(o.m)) return [{ idx: x.idx, m: x.m, min: dojscieMin(x.m), zrodlo: SZACUNEK }];
    return o.m <= maxM * 1.4 || (S.przystanki[x.idx][0] === "K" && o.m <= ZASIEG_STACJI_M * 1.4) ? [{ idx: x.idx, m: o.m, min: o.min, zrodlo: OSRM }] : [];
  });
}
const wDojscia = (sek: (number | null)[], m: (number | null)[], od: number, n: number): Dojscie[] =>
  Array.from({ length: n }, (_, i) => (sek[od + i] == null || m[od + i] == null ? { m: NaN, min: NaN } : { m: m[od + i]!, min: Math.max(1, Math.ceil(sek[od + i]! / 60)) }));

// Kandydaci przy jednym miejscu (np. "przystanki w pobliżu").
export async function kandydaciOsm(S: Siec, p: Punkt, maxM: number, limit = 8): Promise<{ kandydaci: Kand[]; zrodlo: string }> {
  const b = wyroznione(S, p, maxM, limit);
  const t = b.length ? await tabelaPieszo([p, ...b.map((x) => ({ lat: S.przystanki[x.idx][3], lon: S.przystanki[x.idx][4] }))], [0], b.map((_, i) => i + 1)) : null;
  return { kandydaci: naKand(S, b, t ? wDojscia(t.sek[0], t.m[0], 0, b.length) : null, maxM), zrodlo: t ? OSRM : "szacunek (OSRM niedostępny)" };
}

// Kandydaci przy starcie i celu jednym zapytaniem do OSRM.
export async function kandydaciPara(S: Siec, a: Punkt, c: Punkt, maxM: number, limit = 8) {
  const ba = wyroznione(S, a, maxM, limit, true), bc = wyroznione(S, c, maxM, limit, true);
  const pt = (x: { idx: number }) => ({ lat: S.przystanki[x.idx][3], lon: S.przystanki[x.idx][4] });
  const punkty = [a, ...ba.map(pt), c, ...bc.map(pt)];
  const iC = ba.length + 1; // indeks punktu docelowego
  const cele = [...ba.map((_, i) => i + 1), ...bc.map((_, i) => iC + 1 + i)];
  const t = ba.length && bc.length ? await tabelaPieszo(punkty, [0, iC], cele) : null;
  return {
    start: { kandydaci: naKand(S, ba, t ? wDojscia(t.sek[0], t.m[0], 0, ba.length) : null, maxM), zrodlo: t ? OSRM : "szacunek (OSRM niedostępny)" },
    cel: { kandydaci: naKand(S, bc, t ? wDojscia(t.sek[1], t.m[1], ba.length, bc.length) : null, maxM), zrodlo: t ? OSRM : "szacunek (OSRM niedostępny)" },
  };
}
