import { test } from "node:test";
import assert from "node:assert/strict";
import { zCache } from "../src/sources.ts";

// W Workerze `caches.default` istnieje natywnie, w Node go nie ma — podstawiamy
// go na czas testu, żeby sprawdzić trafienia, pudła i klucz z TTL.
// Prawdziwy Cache API normalizuje URL (usuwa tabulatory i nowe linie gdziekolwiek,
// rozpoznaje %20 jako spację), więc zwykła Mapa by tego nie zauważyła — stub to odwzorowuje.
const normalizuj = (url: string) => url.replace(/[\t\n\r]/g, "").replace(/%20/g, " ");

class CacheStub {
  mapa = new Map<string, Response>();
  async match(url: string) {
    return this.mapa.get(normalizuj(url)) ?? undefined;
  }
  async put(url: string, res: Response) {
    this.mapa.set(normalizuj(url), res);
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
    assert.ok(stub.mapa.has("https://lajkonektor.cache/json/v1/3600/" + encodeURIComponent("opis/parki/meta")));
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

test("zCache: błąd źródła nie trafia do cache — kolejne wywołanie próbuje ponownie", async () => {
  const stub = podstawCache();
  try {
    let wywolan = 0;
    const pobierz = async () => { if (++wywolan === 1) throw new Error("BDL 429"); return { a: wywolan }; };

    await assert.rejects(zCache("bdl/temat/P3559", 86400, pobierz), /BDL 429/);
    assert.equal(stub.mapa.size, 0, "odpowiedź błędu nie może zostać zapisana na 24 h");

    const drugi = await zCache("bdl/temat/P3559", 86400, pobierz);
    assert.deepEqual(drugi, { a: 2 }, "drugie wywołanie znów idzie do źródła");
  } finally {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  }
});

test("zCache: klucz z tekstu użytkownika nie koliduje z innym zapytaniem", async () => {
  const stub = podstawCache();
  try {
    // Tabulator jest usuwany przy normalizacji URL, więc „stopa\tbezrobocia"
    // i „stopabezrobocia" lądowałyby na tym samym kluczu; „.." wskakuje w klucz innego zbioru.
    const klucze = ["stopa\tbezrobocia", "stopabezrobocia", "../../../86400/opis/od:parki/probka", "opis/od:parki/probka"];
    for (const k of klucze) await zCache(k, 86400, async () => ({ k }));

    assert.equal(stub.mapa.size, klucze.length, `kolizja kluczy: ${[...stub.mapa.keys()].join(" | ")}`);
  } finally {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  }
});
