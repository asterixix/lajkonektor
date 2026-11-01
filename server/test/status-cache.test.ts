import { test } from "node:test";
import assert from "node:assert/strict";
import { statusZrodel } from "../src/status.ts";
test("diagnostyka: cache źródeł nie przenosi colo/kraju poprzedniego żądania", async () => {
  const origFetch = globalThis.fetch, origCache = (globalThis as any).caches;
  let wywolania = 0; const m = new Map<string, string>();
  globalThis.fetch = (async () => { wywolania++; return Response.json({ count: 1 }); }) as typeof fetch;
  (globalThis as any).caches = { default: { match: async (k: string) => m.has(k) ? new Response(m.get(k)) : undefined, put: async (k: string, r: Response) => { m.set(k, await r.text()); } } };
  try {
    const a = await statusZrodel({ colo: "WAW", country: "PL" });
    const b = await statusZrodel({ colo: "CDG", country: "FR" });
    assert.equal(wywolania, 10); assert.equal(a.testy.length, 10);
    assert.deepEqual(b.worker, { colo: "CDG", kraj: "FR" }); assert.deepEqual(a.testy, b.testy);
  } finally { globalThis.fetch = origFetch; if (origCache === undefined) delete (globalThis as any).caches; else (globalThis as any).caches = origCache; }
});
