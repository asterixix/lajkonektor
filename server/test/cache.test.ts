import { test } from "node:test";
import assert from "node:assert/strict";
import { zCache } from "../src/sources.ts";

// W Workerze `caches.default` istnieje natywnie, w Node go nie ma — podstawiamy
// go na czas testu, żeby sprawdzić trafienia, pudła i klucz z TTL.
class CacheStub {
  mapa = new Map<string, Response>();
  async match(url: string) {
    return this.mapa.get(url) ?? undefined;
  }
  async put(url: string, res: Response) {
    this.mapa.set(url, res);
  }
}

function podstawCache() {
  const stub = new CacheStub();
  (globalThis as unknown as { caches?: unknown }).caches = { default: stub };
  return stub;
}

test("zCache: drugie wywołanie bierze z cache, nie ze źródła", async () => {
  const stub = podstawCache();
  try {
    let wywolan = 0;
    const pobierz = async () => ({ a: ++wywolan });

    const pierwszy = await zCache("opis/parki/meta", 3600, pobierz);
    const drugi = await zCache("opis/parki/meta", 3600, pobierz);

    assert.deepEqual(pierwszy, { a: 1 });
    assert.deepEqual(drugi, { a: 1 });
    assert.equal(wywolan, 1);
    assert.ok(stub.mapa.has("https://lajkonektor.cache/json/v1/3600/opis/parki/meta"));
  } finally {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  }
});

test("zCache: inny TTL to inny klucz", async () => {
  const stub = podstawCache();
  try {
    let wywolan = 0;
    const pobierz = async () => ({ a: ++wywolan });

    await zCache("k", 900, pobierz);
    const drugi = await zCache("k", 86400, pobierz);

    assert.deepEqual(drugi, { a: 2 });
    assert.equal(stub.mapa.size, 2);
  } finally {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  }
});

test("zCache: ttl_s <= 0 omija cache", async () => {
  const stub = podstawCache();
  try {
    let wywolan = 0;
    const pobierz = async () => ({ a: ++wywolan });

    await zCache("k", 0, pobierz);
    await zCache("k", 0, pobierz);

    assert.equal(wywolan, 2);
    assert.equal(stub.mapa.size, 0);
  } finally {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  }
});

test("zCache: bez caches.default idzie prosto do źródła", async () => {
  let wywolan = 0;
  const pobierz = async () => ({ a: ++wywolan });

  const wynik = await zCache("k", 3600, pobierz);

  assert.deepEqual(wynik, { a: 1 });
  assert.equal(wywolan, 1);
});
