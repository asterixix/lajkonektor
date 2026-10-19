// Podkład map w kartach MCP Apps: kafelki OpenStreetMap przez serwer Lajkonektora. Karta w sandboxie nie ma własnego
// User-Agenta ani cache'u, a polityka OSM wymaga identyfikacji aplikacji i buforowania. Obszar i zoom są ograniczone
// do okolic Krakowa, żeby serwer nie służył jako ogólny proxy kafelków.
// shortcut: serwer kafelków osm.org bez umowy, tylko do lekkiego użycia; przy większym ruchu przejść na własny hosting (PMTiles na R2) albo płatnego dostawcę.
const UA = "Lajkonektor/0.3 (+https://lajkonektor.sendyka.workers.dev)";
const OBSZAR = { lonMin: 19.0, lonMax: 21.2, latMin: 49.5, latMax: 50.5 };
export const ZOOM = { min: 9, max: 18 };

const tx = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const ty = (lat: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };

export function kafelWObszarze(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger) || z < ZOOM.min || z > ZOOM.max) return false;
  return x >= tx(OBSZAR.lonMin, z) && x <= tx(OBSZAR.lonMax, z) && y >= ty(OBSZAR.latMax, z) && y <= ty(OBSZAR.latMin, z);
}

/** Ścieżka `/kafelki/{z}/{x}/{y}.png` → odpowiedź z kafelkiem OSM (cache brzegowy Cloudflare 7 dni) albo 404. */
export async function kafelek(pathname: string): Promise<Response> {
  const m = pathname.match(/^\/kafelki\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!m || !kafelWObszarze(+m[1], +m[2], +m[3])) return new Response("Kafelek poza obszarem Krakowa i okolic", { status: 404 });
  const r = await fetch(`https://tile.openstreetmap.org/${m[1]}/${m[2]}/${m[3]}.png`, { headers: { "user-agent": UA }, cf: { cacheTtl: 604800, cacheEverything: true } } as RequestInit);
  if (!r.ok) return new Response("Błąd kafelka OSM", { status: 502 });
  return new Response(r.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
}
