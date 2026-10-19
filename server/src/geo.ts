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

// Uproszczenie pierścienia algorytmem Douglasa-Peuckera (eps w stopniach szerokości; długość skalowana cos(lat)).
export function uprosc(ring: Ring, eps: number): Ring {
  if (ring.length <= 4) return ring;
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
  const out = ring.filter((_, i) => trzymaj[i]);
  return out.length >= 4 ? out : ring;
}

export const zaokragl = (r: Ring, n = 5): Ring => r.map(([x, y]) => [+x.toFixed(n), +y.toFixed(n)]);
