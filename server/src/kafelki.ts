// Podkład map w kartach MCP Apps: kafelki OpenStreetMap przez serwer Lajkonektora. Karta w sandboxie nie ma własnego
// User-Agenta ani cache'u, a polityka OSM wymaga identyfikacji aplikacji i buforowania. Obszar i zoom są ograniczone
// do okolic Krakowa, żeby serwer nie służył jako ogólny proxy kafelków.
// shortcut: serwer kafelków osm.org bez umowy, tylko do lekkiego użycia; przy większym ruchu przejść na własny hosting (PMTiles na R2) albo płatnego dostawcę.
import { WERSJA } from "./wersja.ts";
const UA = `Lajkonektor/${WERSJA} (+https://lajkonektor.sendyka.workers.dev)`;
const OBSZAR = { lonMin: 19.0, lonMax: 21.2, latMin: 49.5, latMax: 50.5 };
export const ZOOM = { min: 9, max: 18 };
/** Ile kafelków na minutę zezwalamy z jednego adresu IP. */
export const LIMIT_KAFELKOW = 240;

// Licznik minutowy w caches.default: przetrwa wyrzucenie izolatu i jest wspólny dla całego kola krawędziowego.
// shortcut: licznik jest przybliżony — równoległe żądania mogą przeoczyć parę wywołań; na twardy limit trzeba WAF,
// a ten działa tylko na własnej domenie (workers.dev jej nie ma).
async function limitKafelkow(ip: string): Promise<boolean> {
  if (typeof caches === "undefined" || !ip) return false;
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const minuta = Math.floor(Date.now() / 60000);
    const url = `https://lajkonektor.cache/kafelki/v1/${minuta}/${encodeURIComponent(ip)}`;
    const trafienie = await cache.match(url);
    const n = Number(await trafienie?.text());
    if (Number.isFinite(n) && n >= LIMIT_KAFELKOW) return true;
    await cache.put(url, new Response(String((Number.isFinite(n) ? n : 0) + 1), { headers: { "cache-control": "public, max-age=120" } }));
    return false;
  } catch {
    return false; // Awaria cache nie może wyłączać kafelków — limitu po prostu nie ma.
  }
}

const tx = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const ty = (lat: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };

export function kafelWObszarze(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger) || z < ZOOM.min || z > ZOOM.max) return false;
  return x >= tx(OBSZAR.lonMin, z) && x <= tx(OBSZAR.lonMax, z) && y >= ty(OBSZAR.latMax, z) && y <= ty(OBSZAR.latMin, z);
}

/** Ścieżka `/kafelki/{z}/{x}/{y}.png` → odpowiedź z kafelkiem OSM (cache brzegowy Cloudflare 7 dni) albo 404. */
export async function kafelek(pathname: string, ip = "test"): Promise<Response> {
  const m = pathname.match(/^\/kafelki\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!m || !kafelWObszarze(+m[1], +m[2], +m[3])) return new Response("Kafelek poza obszarem Krakowa i okolic", { status: 404 });
  if (await limitKafelkow(ip)) return new Response("Za duzo kafelkow z jednego adresu. Sprobuj za minute.", { status: 429, headers: { "retry-after": "60", "access-control-allow-origin": "*" } });
  const r = await fetch(`https://tile.openstreetmap.org/${m[1]}/${m[2]}/${m[3]}.png`, { headers: { "user-agent": UA }, cf: { cacheTtl: 604800, cacheEverything: true } } as RequestInit);
  if (!r.ok) return new Response("Błąd kafelka OSM", { status: 502 });
  return new Response(r.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
}
