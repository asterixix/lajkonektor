// Drobna geometria na współrzędnych WGS84 (lon, lat) w skali miasta; bez zależności.
export type Ring = [number, number][];

const K = Math.cos((50.06 * Math.PI) / 180); // skala długości geograficznej na szerokości Krakowa

// Środek ciężkości największego pierścienia (rzutowanie lokalne), do pokazania punktu na mapie.
export function centroid(rings: Ring[]): { lat: number; lon: number } {
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a));
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * K * y2 - x2 * K * y1;
    a += f; cx += (x1 * K + x2 * K) * f; cy += (y1 + y2) * f;
  }
  return a === 0
    ? { lat: ring[0][1], lon: ring[0][0] }
    : { lat: +(cy / (3 * a)).toFixed(6), lon: +(cx / (3 * a) / K).toFixed(6) };
}

export function bbox(rings: Ring[]): [number, number, number, number] {
  const pts = rings.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Pole pierścienia w hektarach (rzutowanie lokalne, wystarcza w skali miasta).
export function ringAreaHa(ring: Ring): number {
  const ky = 110540, kx = 111320 * K;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * kx * y2 * ky - x2 * kx * y1 * ky;
  }
  return Math.abs(a) / 2 / 10_000;
}

// Esri JSON wymaga pierścieni zewnętrznych zgodnie z ruchem wskazówek zegara.
export function clockwise(ring: Ring): Ring {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    s += (x2 - x1) * (y2 + y1);
  }
  return s > 0 ? ring : ring.slice().reverse();
}

// Douglas-Peucker na otwartej łamanej (eps w stopniach szerokości; długość skalowana cos(lat)).
function dp(ring: Ring, eps: number): Ring {
  if (ring.length <= 2) return ring;
  const P = ring.map(([x, y]) => [x * K, y] as [number, number]);
  const trzymaj = new Uint8Array(ring.length);
  trzymaj[0] = trzymaj[ring.length - 1] = 1;
  const stos: [number, number][] = [[0, ring.length - 1]];
  while (stos.length) {
    const [a, b] = stos.pop()!;
    let maks = 0, idx = -1;
    const [ax, ay] = P[a], [bx, by] = P[b];
    const dl = Math.hypot(bx - ax, by - ay) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((by - ay) * P[i][0] - (bx - ax) * P[i][1] + bx * ay - by * ax) / dl;
      if (d > maks) { maks = d; idx = i; }
    }
    if (maks > eps && idx > 0) { trzymaj[idx] = 1; stos.push([a, idx], [idx, b]); }
  }
  return ring.filter((_, i) => trzymaj[i]);
}

// Uproszczenie pierścienia. Pierścień zamknięty (pierwszy punkt = ostatni) dzielimy w najdalszym wierzchołku,
// bo Douglas-Peucker na pętli ma zerową bazę i nic nie upraszcza.
export function uprosc(ring: Ring, eps: number): Ring {
  if (ring.length <= 4) return ring;
  const f = ring[0], l = ring[ring.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) { const o = dp(ring, eps); return o.length >= 4 ? o : ring; }
  let idx = 1, maks = -1;
  for (let i = 1; i < ring.length - 1; i++) { const d = Math.hypot((ring[i][0] - f[0]) * K, ring[i][1] - f[1]); if (d > maks) { maks = d; idx = i; } }
  const o = [...dp(ring.slice(0, idx + 1), eps), ...dp(ring.slice(idx), eps).slice(1)];
  return o.length >= 4 ? o : ring;
}

export const zaokragl = (r: Ring, n = 5): Ring => r.map(([x, y]) => [+x.toFixed(n), +y.toFixed(n)]);

// Odległość w metrach (rzutowanie lokalne, wystarcza w skali miasta i okolic).
export const metry = (lat1: number, lon1: number, lat2: number, lon2: number): number =>
  Math.hypot((lon2 - lon1) * 111_320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)), (lat2 - lat1) * 110_540);

/** Odległość punktu od najbliższego odcinka pierścieni (granicy obszaru), w metrach; 0, gdy punkt leży w środku. */
export function odlegloscDoObszaru(lat: number, lon: number, rings: Ring[]): number {
  if (wObszarze(lon, lat, rings)) return 0;
  const kx = 111_320 * Math.cos(lat * (Math.PI / 180)), ky = 110_540;
  let min = Infinity;
  for (const r of rings) for (let i = 0; i < r.length - 1; i++) {
    const ax = (r[i][0] - lon) * kx, ay = (r[i][1] - lat) * ky, bx = (r[i + 1][0] - lon) * kx, by = (r[i + 1][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < min) min = d;
  }
  return min;
}

/** Czy punkt leży w obszarze (reguła parzystości; dziury w pierścieniach działają, bo wszystkie pierścienie liczą się razem). */
export function wObszarze(lon: number, lat: number, rings: Ring[]): boolean {
  let w = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) w = !w;
  }
  return w;
}
