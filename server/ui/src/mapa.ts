// Mapa SVG: podkład OpenStreetMap (kafelki przez serwer Lajkonektora, jeśli wynik niesie `_kafelki`) i warstwa z danych:
// kontury, linie i punkty (lon/lat WGS84) w rzutowaniu Web Mercator. Bez adresu kafelków rysuje tylko dane na szarym tle.
import { esc } from "./pomoc.ts";

export type Ring = [number, number][]; // [lon, lat]
export interface Poligon { id?: string; rings: Ring[]; klasa?: string; etykieta?: { tekst: string; glowna?: boolean; priorytet?: number } }
export interface LiniaMapy { pts: Ring; klasa: "pieszo" | "jazda" }
export interface PunktMapy { lat: number; lon: number; klasa?: "start" | "cel" | "przystanek" | "obiekt"; etykieta?: string }

export interface OpcjeMapy {
  szer?: number; // ignorowane: szerokość widoku wynika z zakresu danych, a SVG skaluje się do karty
  poligony?: Poligon[];
  linie?: LiniaMapy[];
  punkty?: PunktMapy[];
  przypis?: string;
  opis: string; // alt dla czytników ekranu
  skala?: boolean;
  min_wys?: number;
  maks_zoom?: number;
}

/** Szablon adresu kafelków, np. https://host/kafelki/{z}/{x}/{y}.png; ustawia go main.ts z pola `_kafelki` wyniku. */
export const konfiguracja: { kafelki?: string } = {};

const KAFEL = 256, PAD = 18, SZER = 640;
const merX = (lon: number, z: number) => ((lon + 180) / 360) * KAFEL * 2 ** z;
const merY = (lat: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * KAFEL * 2 ** z; };
const dlugoscEtykiety = (t: string) => Math.round(t.length * 6.7 + 12);

function granice(o: OpcjeMapy): [number, number, number, number] {
  const pts: [number, number][] = [];
  for (const p of o.poligony ?? []) for (const r of p.rings) pts.push(...r);
  for (const l of o.linie ?? []) pts.push(...l.pts);
  for (const p of o.punkty ?? []) pts.push([p.lon, p.lat]);
  if (!pts.length) return [19.935, 50.06, 19.945, 50.066];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const ladnaDlugosc = (m: number) => {
  const kroki = [20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
  return kroki.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
};

export function srodekRing(r: Ring): [number, number] {
  const x = r.map((p) => p[0]), y = r.map((p) => p[1]);
  return [(Math.min(...x) + Math.max(...x)) / 2, (Math.min(...y) + Math.max(...y)) / 2];
}

export function mapa(o: OpcjeMapy): string {
  let [x0, y0, x1, y1] = granice(o);
  if (x1 - x0 < 1e-4) { x0 -= 5e-4; x1 += 5e-4; }
  if (y1 - y0 < 1e-4) { y0 -= 3e-4; y1 += 3e-4; }

  // Największy zoom, przy którym obszar mieści się w widoku (szerokość ≤ 1,35 × bazowej, wysokość ≤ 0,8 szerokości).
  let z = o.maks_zoom ?? 17;
  for (; z > 1; z--) {
    const bw = merX(x1, z) - merX(x0, z), bh = merY(y0, z) - merY(y1, z);
    if (bw + 2 * PAD <= SZER * 1.35 && bh + 2 * PAD <= Math.max(SZER, bw + 2 * PAD) * 0.8) break;
  }
  const bw = merX(x1, z) - merX(x0, z), bh = merY(y0, z) - merY(y1, z);
  const VW = Math.round(Math.max(SZER, bw + 2 * PAD));
  const u = VW / SZER; // jednostki widoku na „piksel ekranu przy szerokości 640”: tyle razy powiększamy znaczniki i napisy
  const VH = Math.round(Math.min(VW * 0.8, Math.max((o.min_wys ?? 240) * u, bh + 2 * PAD)));
  const ox = (merX(x0, z) + merX(x1, z)) / 2 - VW / 2, oy = (merY(y0, z) + merY(y1, z)) / 2 - VH / 2;
  const px = (lon: number) => +(merX(lon, z) - ox).toFixed(1);
  const py = (lat: number) => +(merY(lat, z) - oy).toFixed(1);

  let kafelki = "";
  if (konfiguracja.kafelki) {
    const n = 2 ** z;
    for (let ty = Math.floor(oy / KAFEL); ty <= Math.floor((oy + VH) / KAFEL); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(ox / KAFEL); tx <= Math.floor((ox + VW) / KAFEL); tx++) {
        const url = konfiguracja.kafelki.replace("{z}", String(z)).replace("{x}", String(((tx % n) + n) % n)).replace("{y}", String(ty));
        kafelki += `<image href="${esc(url)}" x="${+(tx * KAFEL - ox).toFixed(1)}" y="${+(ty * KAFEL - oy).toFixed(1)}" width="${KAFEL}" height="${KAFEL}"/>`;
      }
    }
  }

  const sciezka = (rings: Ring[]) => rings.map((r) => "M" + r.map((p) => `${px(p[0])},${py(p[1])}`).join("L") + "Z").join("");
  const poligony = (o.poligony ?? []).map((p) => `<path class="park ${esc(p.klasa ?? "")}" data-id="${esc(p.id ?? "")}" fill-rule="evenodd" d="${sciezka(p.rings)}"><title>${esc(p.etykieta?.tekst ?? "")}</title></path>`).join("");
  const linie = (o.linie ?? []).map((l) => {
    const pts = l.pts.map((p) => `${px(p[0])},${py(p[1])}`).join(" ");
    return `<polyline class="obrys-${l.klasa}" points="${pts}"/><polyline class="trasa-${l.klasa}" points="${pts}"/>`;
  }).join("");
  const r = (k?: string) => +((k === "przystanek" || k === "obiekt" ? 6 : 8) * u).toFixed(1);
  const kropki = (o.punkty ?? []).map((p) => `<circle class="kropka ${p.klasa ?? ""}" cx="${px(p.lon)}" cy="${py(p.lat)}" r="${r(p.klasa)}"/>`).join("");

  // Etykiety: najpierw główne, potem większe obiekty; pomijamy te, które nachodzą na już położone.
  type Et = { x: number; y: number; t: string; glowna: boolean; pri: number };
  const kand: Et[] = [];
  for (const p of o.poligony ?? []) if (p.etykieta) { const [cx, cy] = srodekRing(p.rings[0]); kand.push({ x: px(cx), y: py(cy), t: p.etykieta.tekst, glowna: !!p.etykieta.glowna, pri: p.etykieta.glowna ? 0 : (p.etykieta.priorytet ?? 5) }); }
  for (const p of o.punkty ?? []) if (p.etykieta) kand.push({ x: px(p.lon), y: py(p.lat) - 20 * u, t: p.etykieta, glowna: p.klasa === "start" || p.klasa === "cel", pri: p.klasa === "start" || p.klasa === "cel" ? 0 : 6 });
  kand.sort((a, b) => a.pri - b.pri);
  const polozone: { x: number; y: number; w: number }[] = [];
  const eh = 20 * u;
  const etykiety = kand.map((e) => {
    const w = dlugoscEtykiety(e.t) * u;
    const x = Math.min(VW - w - 4, Math.max(4, e.x - w / 2)), y = Math.min(VH - eh - 2, Math.max(4, e.y - eh / 2));
    if (polozone.some((q) => Math.abs(q.x - x) < Math.max(q.w, w) * 0.9 && Math.abs(q.y - y) < eh)) return "";
    polozone.push({ x, y, w });
    return `<g class="etykieta${e.glowna ? " glowna" : ""}"><rect x="${+x.toFixed(1)}" y="${+y.toFixed(1)}" width="${+w.toFixed(1)}" height="${+eh.toFixed(1)}"/><text x="${+(x + 6 * u).toFixed(1)}" y="${+(y + 14 * u).toFixed(1)}" style="font-size:${+(12 * u).toFixed(1)}px">${esc(e.t)}</text></g>`;
  }).join("");

  let skala = "";
  if (o.skala !== false) {
    const mpu = (156543.03392 * Math.cos((((y0 + y1) / 2) * Math.PI) / 180)) / 2 ** z; // metrów na jednostkę widoku
    const dl = ladnaDlugosc(mpu * SZER * 0.2 * u);
    const w = dl / mpu / u; // szerokość w jednostkach „ekranowych”, bo grupa jest skalowana o u
    skala = `<g class="skala" transform="translate(${+(10 * u).toFixed(1)},${+(VH - 10 * u).toFixed(1)}) scale(${+u.toFixed(3)})"><rect x="-4" y="-22" width="${+(w + 16 + String(dl).length * 8 + 22).toFixed(1)}" height="28" fill="#fff" fill-opacity=".9"/><line x1="4" y1="-4" x2="${+(4 + w).toFixed(1)}" y2="-4"/><line x1="4" y1="-9" x2="4" y2="0"/><line x1="${+(4 + w).toFixed(1)}" y1="-9" x2="${+(4 + w).toFixed(1)}" y2="0"/><text x="${+(12 + w).toFixed(1)}" y="0">${dl >= 1000 ? dl / 1000 + " km" : dl + " m"}</text></g>`;
  }
  const osm = kafelki ? `<g class="osm" transform="translate(${VW},${VH}) scale(${+u.toFixed(3)})"><rect x="-176" y="-18" width="176" height="18" fill="#fff" fill-opacity=".85"/><text x="-170" y="-5">© współtwórcy OpenStreetMap</text></g>` : "";
  return `<div class="mapa"><svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${esc(o.opis)}"><rect width="${VW}" height="${VH}" fill="#e9e6df"/>${kafelki}${poligony}${linie}${kropki}${etykiety}${skala}${osm}</svg>${o.przypis ? `<div class="przypis">${esc(o.przypis)}</div>` : ""}</div>`;
}
