// Proxy kafelków OSM: ograniczenia obszaru i zoomu (offline); sam pobór z osm.org nie jest testowany, żeby nie obciążać ich serwerów.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMIT_KAFELKOW, kafelWObszarze, kafelek } from "../src/kafelki.ts";

const x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y = (lat: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };

test("kafelki: Rynek w Krakowie na zoomach 9-18 jest dozwolony, Warszawa i skrajne zoomy nie", () => {
  for (let z = 9; z <= 18; z++) assert.ok(kafelWObszarze(z, x(19.9372, z), y(50.0614, z)), `z=${z}`);
  assert.ok(!kafelWObszarze(16, x(21.0122, 16), y(52.2297, 16)), "Warszawa");
  assert.ok(!kafelWObszarze(8, x(19.9372, 8), y(50.0614, 8)), "za mały zoom");
  assert.ok(!kafelWObszarze(19, x(19.9372, 19), y(50.0614, 19)), "za duży zoom");
  assert.ok(!kafelWObszarze(16, 1.5, 2), "liczby niecałkowite");
});

test("kafelki: ścieżka spoza obszaru lub w złym formacie daje 404 bez pytania osm.org", async () => {
  for (const p of ["/kafelki/16/0/0.png", "/kafelki/abc/1/1.png", "/kafelki/16/36397/22208.jpg", "/kafelki/16/36397/22208.png/../x"]) assert.equal((await kafelek(p)).status, 404, p);
});

// Licznik limitu żyje w caches.default, więc w teście wystarczy zwykły zamiennik.
class CacheKaf {
  mapa = new Map<string, string>();
  async match(u: string) { const t = this.mapa.get(u); return t === undefined ? undefined : new Response(t); }
  async put(u: string, r: Response) { this.mapa.set(u, await r.text()); }
}

test("kafelki: powyżej limitu na minutę IP dostaje 429, inny IP przechodzi", async () => {
  const cache = new CacheKaf();
  (globalThis as { caches?: unknown }).caches = { default: cache };
  const prawdziwyFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("png")) as typeof fetch;
  try {
    let ograniczonych = 0;
    for (let i = 0; i < LIMIT_KAFELKOW + 2; i++) if ((await kafelek("/kafelki/16/36397/22208.png", "1.2.3.4")).status === 429) ograniczonych++;
    assert.equal(ograniczonych, 2, `429 dla ${ograniczonych} z ${LIMIT_KAFELKOW + 2} prób`);
    assert.equal(cache.mapa.size, 1, "jeden licznik na minutę i IP");
    assert.equal((await kafelek("/kafelki/16/36397/22208.png", "5.6.7.8")).status, 200, "inny IP nie jest limitowany");
    assert.equal((await kafelek("/kafelki/16/0/0.png", "1.2.3.4")).status, 404, "ścieżka poza obszarem nie zużywa limitu");
  } finally {
    globalThis.fetch = prawdziwyFetch;
    delete (globalThis as { caches?: unknown }).caches;
  }
});
