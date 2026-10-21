// Wykres liniowy SVG: seria historyczna, opcjonalnie prognoza z pasmami 80% i 95%. Bez bibliotek.
import { esc, liczba } from "./pomoc.ts";

export interface PunktSerii { x: number; y: number }
export interface PunktPrognozy extends PunktSerii { d80: number; g80: number; d95: number; g95: number }

const W = 600, H = 240, L = 46, P = 24, T = 26, B = 30;

function ladneTicki(min: number, max: number, n = 4): number[] {
  const zakres = max - min || Math.abs(max) || 1;
  const surowy = zakres / n;
  const mag = 10 ** Math.floor(Math.log10(surowy));
  const krok = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((k) => k >= surowy) ?? mag * 10;
  const start = Math.floor(min / krok) * krok;
  const out: number[] = [];
  for (let v = start; v <= max + krok * 0.999; v += krok) out.push(+v.toFixed(10));
  return out;
}

export function wykres(o: { punkty: PunktSerii[]; prognoza?: PunktPrognozy[]; jednostka?: string; opis: string; od_zera?: boolean }): string {
  const hist = o.punkty, prog = o.prognoza ?? [];
  const wszystkie = [...hist.map((p) => p.y), ...prog.flatMap((p) => [p.d95, p.g95, p.y])];
  let ymin = Math.min(...wszystkie), ymax = Math.max(...wszystkie);
  if (o.od_zera !== false && ymin > 0) ymin = 0;
  const ticki = ladneTicki(ymin, ymax);
  ymin = Math.min(ymin, ticki[0]); ymax = Math.max(ymax, ticki[ticki.length - 1]);
  const xs = [...hist.map((p) => p.x), ...prog.map((p) => p.x)];
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const X = (x: number) => +(L + ((x - xmin) / (xmax - xmin || 1)) * (W - L - P)).toFixed(1);
  const Y = (y: number) => +(T + (1 - (y - ymin) / (ymax - ymin || 1)) * (H - T - B)).toFixed(1);
  const fmt = (v: number) => liczba(v, Math.abs(v) < 10 ? 1 : 0) + (o.jednostka === "%" ? "%" : "");

  const siatka = ticki.map((t) => `<line class="siatka" x1="${L}" x2="${W - P}" y1="${Y(t)}" y2="${Y(t)}"/><text class="os-t" x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join("");
  const nTick = Math.min(6, xs.length);
  const xTicki = [...new Set(Array.from({ length: nTick }, (_, i) => Math.round(xmin + ((xmax - xmin) * i) / Math.max(1, nTick - 1))))];
  const osX = xTicki.map((x) => `<text class="os-t" x="${X(x)}" y="${H - 8}" text-anchor="${x === xmax ? "end" : x === xmin ? "start" : "middle"}">${x}</text>`).join("");

  const linia = hist.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ");
  const last = hist[hist.length - 1];
  let pasma = "", liniaProg = "";
  if (prog.length) {
    const gorna95 = [last, ...prog].map((p, i) => `${X(p.x)},${Y(i === 0 ? last.y : (p as PunktPrognozy).g95)}`);
    const dolna95 = [last, ...prog].map((p, i) => `${X(p.x)},${Y(i === 0 ? last.y : (p as PunktPrognozy).d95)}`).reverse();
    const gorna80 = [last, ...prog].map((p, i) => `${X(p.x)},${Y(i === 0 ? last.y : (p as PunktPrognozy).g80)}`);
    const dolna80 = [last, ...prog].map((p, i) => `${X(p.x)},${Y(i === 0 ? last.y : (p as PunktPrognozy).d80)}`).reverse();
    pasma = `<polygon class="pasmo95" points="${[...gorna95, ...dolna95].join(" ")}"/><polygon class="pasmo80" points="${[...gorna80, ...dolna80].join(" ")}"/>`;
    liniaProg = `<polyline class="linia prognoza" points="${[last, ...prog].map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}"/>`;
  }
  // Etykiety: maksimum, minimum i ostatnia wartość historii (jak w systemie graficznym).
  const imax = hist.reduce((a, p, i) => (p.y > hist[a].y ? i : a), 0), imin = hist.reduce((a, p, i) => (p.y < hist[a].y ? i : a), 0);
  const ets = new Map<number, string>([[imax, "max"], [imin, "min"], [hist.length - 1, "ost"]]);
  const punkty = [...ets.keys()].map((i) => {
    const p = hist[i], klasa = i === hist.length - 1 ? "pkt ostatni" : "pkt";
    const wyzej = ets.get(i) === "max" || (ets.get(i) === "ost" && i !== imin);
    const anchor = p.x === xmax && !prog.length ? "end" : "middle";
    return `<circle class="${klasa}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${i === hist.length - 1 ? 6 : 5}"/><text class="et-w" x="${X(p.x)}" y="${Y(p.y) + (wyzej ? -12 : 20)}" text-anchor="${anchor}">${esc(fmt(p.y))}</text>`;
  }).join("");
  const koniecProg = prog.length ? `<circle class="pkt ostatni" cx="${X(prog[prog.length - 1].x)}" cy="${Y(prog[prog.length - 1].y)}" r="5"/><text class="et-w" x="${X(prog[prog.length - 1].x)}" y="${Y(prog[prog.length - 1].y) - 12}" text-anchor="end">${esc(fmt(prog[prog.length - 1].y))}</text>` : "";
  return `<div class="wykres"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.opis)}">${siatka}${pasma}<polyline class="linia" points="${linia}"/>${liniaProg}${punkty}${koniecProg}${osX}</svg></div>`;
}

/** Wykres punktowy (korelacja) z prostą regresji; punkty z podpisem pokazują go po najechaniu. */
export function punktowy(p: { x: number; y: number; etykieta?: string | number }[], regresja?: { a: number; b: number }): string {
  const W = 600, H = 300, L = 54, R = 20, T = 16, B = 34;
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (v: number) => +(L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R)).toFixed(1), Y = (v: number) => +(T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B)).toFixed(1);
  const kropki = p.map((q) => `<circle cx="${X(q.x)}" cy="${Y(q.y)}" r="5" fill="#0063AF" fill-opacity=".75" stroke="#fff"><title>${esc(q.etykieta ?? "")} (${liczba(q.x, 2)}; ${liczba(q.y, 2)})</title></circle>`).join("");
  const linia = regresja && Number.isFinite(regresja.a) ? `<line x1="${X(x0)}" y1="${Y(regresja.b + regresja.a * x0)}" x2="${X(x1)}" y2="${Y(regresja.b + regresja.a * x1)}" stroke="#071F32" stroke-width="2" stroke-dasharray="6 4"/>` : "";
  const osie = `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#BFBFBF"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#BFBFBF"/><text class="os-t" x="${L}" y="${H - 12}">${liczba(x0, 1)}</text><text class="os-t" x="${W - R}" y="${H - 12}" text-anchor="end">${liczba(x1, 1)}</text><text class="os-t" x="${L - 6}" y="${H - B}" text-anchor="end">${liczba(y0, 1)}</text><text class="os-t" x="${L - 6}" y="${T + 10}" text-anchor="end">${liczba(y1, 1)}</text>`;
  return `<div class="wykres"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wykres punktowy, ${p.length} punktów">${osie}${linia}${kropki}</svg></div>`;
}
