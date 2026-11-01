import { test } from "node:test";
import assert from "node:assert/strict";
import { limitMinutowy } from "../src/limit.ts";

// Atrapa caches.default: Map zamiast Cache API (w Node brak `caches`).
function atrapaCache(): Cache {
  const mapa = new Map<string, string>();
  return {
    async match(url: string) {
      const v = mapa.get(String(url));
      return v === undefined ? undefined : new Response(v);
    },
    async put(url: string, r: Response) {
      mapa.set(String(url), await r.text());
    },
  } as unknown as Cache;
}

test("przepuszcza do limitu, potem blokuje", async () => {
  const cache = atrapaCache();
  const wyniki: boolean[] = [];
  for (let i = 0; i < 4; i++) wyniki.push(await limitMinutowy("test", "1.2.3.4", 3, cache));
  assert.deepEqual(wyniki, [false, false, false, true]);
});

test("liczniki są osobne dla każdego IP", async () => {
  const cache = atrapaCache();
  for (let i = 0; i < 3; i++) await limitMinutowy("test", "1.1.1.1", 3, cache);
  assert.equal(await limitMinutowy("test", "2.2.2.2", 3, cache), false);
});

test("pusty IP i brak cache nigdy nie blokują", async () => {
  assert.equal(await limitMinutowy("test", "", 0, atrapaCache()), false);
  assert.equal(await limitMinutowy("test", "1.1.1.1", 0, undefined), false);
});

test("limitDzienny: blokuje po przekroczeniu limitu dobowego, osobno dla każdego klucza", async () => {
  const { limitDzienny } = await import("../src/limit.ts");
  const cache = atrapaCache();
  const wyniki: boolean[] = [];
  for (let i = 0; i < 4; i++) wyniki.push(await limitDzienny("t", "wszyscy", 3, cache));
  assert.deepEqual(wyniki, [false, false, false, true]);
  assert.equal(await limitDzienny("t", "inny", 3, cache), false);
  assert.equal(await limitDzienny("t", "", 3, cache), false, "pusty klucz wyłącza licznik zamiast blokować wszystkich");
});
