// Licznik minutowy na IP w caches.default: przetrwa wyrzucenie izolatu i jest wspólny dla kola krawędziowego.
// shortcut: licznik jest przybliżony, równoległe żądania mogą przeoczyć parę wywołań; na twardy limit trzeba WAF,
// a ten działa tylko na własnej domenie (workers.dev jej nie ma).
export async function limitMinutowy(
  prefiks: string,
  ip: string,
  max: number,
  cache: Cache | undefined = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default,
): Promise<boolean> {
  if (!cache || !ip) return false;
  try {
    const minuta = Math.floor(Date.now() / 60000);
    const url = `https://lajkonektor.cache/${prefiks}/v1/${minuta}/${encodeURIComponent(ip)}`;
    const trafienie = await cache.match(url);
    const n = Number(await trafienie?.text());
    if (Number.isFinite(n) && n >= max) return true;
    await cache.put(url, new Response(String((Number.isFinite(n) ? n : 0) + 1), { headers: { "cache-control": "public, max-age=120" } }));
    return false;
  } catch {
    return false; // Awaria cache nie może wyłączać usługi — limitu po prostu nie ma.
  }
}

// Licznik dzienny (doba UTC) w caches.default, np. globalny budżet czatu. Ta sama zasada: przybliżony, a awaria cache go wyłącza.
export async function limitDzienny(
  prefiks: string,
  klucz: string,
  max: number,
  cache: Cache | undefined = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default,
): Promise<boolean> {
  if (!cache || !klucz) return false;
  try {
    const dzien = Math.floor(Date.now() / 86_400_000);
    const url = `https://lajkonektor.cache/${prefiks}/dzien/v1/${dzien}/${encodeURIComponent(klucz)}`;
    const trafienie = await cache.match(url);
    const n = Number(await trafienie?.text());
    if (Number.isFinite(n) && n >= max) return true;
    await cache.put(url, new Response(String((Number.isFinite(n) ? n : 0) + 1), { headers: { "cache-control": "public, max-age=90000" } }));
    return false;
  } catch {
    return false;
  }
}
