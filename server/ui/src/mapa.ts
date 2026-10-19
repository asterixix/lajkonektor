// Mapa SVG bez kafelków: rysuje kontury, linie i punkty z danych (lon/lat WGS84) w rzutowaniu równoodległościowym.
// Nie ładuje żadnych zewnętrznych zasobów (sandbox hosta ich nie przepuści), więc tło to tylko dane z wyniku.
import { esc } from "./pomoc.ts";

export type Ring = [number, number][]; // [lon, lat]
export interface Poligon { id?: string; rings: Ring[]; klasa?: string; etykieta?: { tekst: string; glowna?: boolean; priorytet?: number } }
export interface LiniaMapy { pts: Ring; klasa: "pieszo" | "jazda" }
export interface PunktMapy { lat: number; lon: number; klasa?: "start" | "cel" | "przystanek"; etykieta?: string }

export interface OpcjeMapy {
  szer?: number;
  poligony?: Poligon[];
  linie?: LiniaMapy[];
  punkty?: PunktMapy[];
  przypis?: string;
  opis: string; // alt dla czytników ekranu
  skala?: boolean;
  min_wys?: number;
}

const PAD = 14;
const dlugoscEtykiety = (t: string) => Math.round(t.length * 6.7 + 12);

function granice(o: OpcjeMapy): [number, number, number, number] {
  const pts: [number, number][] = [];
  for (const p of o.poligony ?? []) for (const r of p.rings) pts.push(...r);
  for (const l of o.linie ?? []) pts.push(...l.pts);
  for (const p of o.punkty ?? []) pts.push([p.lon, p.lat]);
  if (!pts.length) return [19.94, 50.06, 19.95, 50.07];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const ladnaDlugosc = (m: number) => {
  const kroki = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  return kroki.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
};

export function srodekRing(r: Ring): [number, number] {
  const x = r.map((p) => p[0]), y = r.map((p) => p[1]);
  return [(Math.min(...x) + Math.max(...x)) / 2, (Math.min(...y) + Math.max(...y)) / 2];
}

export function mapa(o: OpcjeMapy): string {
  const W = o.szer ?? 640;
  let [x0, y0, x1, y1] = granice(o);
  if (x1 - x0 < 1e-4) { x0 -= 5e-4; x1 += 5e-4; }
  if (y1 - y0 < 1e-4) { y0 -= 5e-4; y1 += 5e-4; }
  const k = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
  const dx = (x1 - x0) * k, dy = y1 - y0;
  const H = Math.round(Math.min(380, Math.max(o.min_wys ?? 220, (W - 2 * PAD) * (dy / dx) + 2 * PAD)));
  const s = Math.min((W - 2 * PAD) / dx, (H - 2 * PAD) / dy); // px na stopień szerokości geograficznej
  const ox = (W - dx * s) / 2, oy = (H - dy * s) / 2;
  const px = (lon: number) => +(ox + (lon - x0) * k * s).toFixed(1);
  const py = (lat: number) => +(oy + (y1 - lat) * s).toFixed(1);

  const sciezka = (rings: Ring[]) => rings.map((r) => "M" + r.map((p) => `${px(p[0])},${py(p[1])}`).join("L") + "Z").join("");
  const poligony = (o.poligony ?? []).map((p) => `<path class="park ${esc(p.klasa ?? "")}" data-id="${esc(p.id ?? "")}" fill-rule="evenodd" d="${sciezka(p.rings)}"><title>${esc(p.etykieta?.tekst ?? "")}</title></path>`).join("");
  const linie = (o.linie ?? []).map((l) => `<polyline class="trasa-${l.klasa}" points="${l.pts.map((p) => `${px(p[0])},${py(p[1])}`).join(" ")}"/>`).join("");
  const kropki = (o.punkty ?? []).map((p) => `<circle class="kropka ${p.klasa ?? ""}" cx="${px(p.lon)}" cy="${py(p.lat)}" r="${p.klasa === "przystanek" ? 6 : 8}"/>`).join("");

  // Etykiety: najpierw główne, potem większe obiekty; pomijamy te, które nachodzą na już położone.
  type Et = { x: number; y: number; t: string; glowna: boolean; pri: number };
  const kand: Et[] = [];
  for (const p of o.poligony ?? []) if (p.etykieta) { const [cx, cy] = srodekRing(p.rings[0]); kand.push({ x: px(cx), y: py(cy), t: p.etykieta.tekst, glowna: !!p.etykieta.glowna, pri: p.etykieta.glowna ? 0 : (p.etykieta.priorytet ?? 5) }); }
  for (const p of o.punkty ?? []) if (p.etykieta) kand.push({ x: px(p.lon), y: py(p.lat) - 20, t: p.etykieta, glowna: p.klasa === "start" || p.klasa === "cel", pri: p.klasa === "start" || p.klasa === "cel" ? 0 : 6 });
  kand.sort((a, b) => a.pri - b.pri);
  const polozone: { x: number; y: number; w: number }[] = [];
  const etykiety = kand.map((e) => {
    const w = dlugoscEtykiety(e.t);
    const x = Math.min(W - w - 4, Math.max(4, e.x - w / 2)), y = Math.min(H - 22, Math.max(4, e.y - 9));
    if (polozone.some((q) => Math.abs(q.x - x) < Math.max(q.w, w) * 0.9 && Math.abs(q.y - y) < 20)) return "";
    polozone.push({ x, y, w });
    return `<g class="etykieta${e.glowna ? " glowna" : ""}"><rect x="${x}" y="${y}" width="${w}" height="20"/><text x="${x + 6}" y="${y + 14}">${esc(e.t)}</text></g>`;
  }).join("");

  let skala = "";
  if (o.skala !== false) {
    const mpx = 110540 / s;
    const dl = ladnaDlugosc(mpx * W * 0.2);
    const wPx = dl / mpx;
    const sx = W - 14 - wPx - 8, sy = H - 14;
    skala = `<g class="skala"><rect x="${sx - 8}" y="${sy - 20}" width="${wPx + 16 + String(dl).length * 8 + 22}" height="28" fill="#fff" stroke="var(--lk-szary-linia)"/><line x1="${sx}" y1="${sy}" x2="${sx + wPx}" y2="${sy}"/><line x1="${sx}" y1="${sy - 5}" x2="${sx}" y2="${sy + 4}"/><line x1="${sx + wPx}" y1="${sy - 5}" x2="${sx + wPx}" y2="${sy + 4}"/><text x="${sx + wPx + 8}" y="${sy + 4}">${dl >= 1000 ? dl / 1000 + " km" : dl + " m"}</text></g>`;
  }
  return `<div class="mapa"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.opis)}">${poligony}${linie}${kropki}${etykiety}${skala}</svg>${o.przypis ? `<div class="przypis">${esc(o.przypis)}</div>` : ""}</div>`;
}
