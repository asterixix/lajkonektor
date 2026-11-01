import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import { dostepnosc, zapiszPomiar } from "../src/strony.ts";

const przegladarka = { accept: "text/html,application/xhtml+xml,*/*;q=0.8" };

test("/mcp: przeglądarka dostaje instrukcję, klient MCP nadal protokół", async () => {
  const html = await worker.fetch(new Request("https://x.test/mcp", { headers: przegladarka }));
  assert.match(html.headers.get("content-type")!, /text\/html/);
  const t = await html.text();
  assert.match(t, /https:\/\/x\.test\/mcp/); assert.match(t, /Claude/);
  const mcp = await worker.fetch(new Request("https://x.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
  assert.match(await mcp.text(), /katalog_szukaj/);
});

test("/health: JSON dla programów bez zmian; przeglądarka widzi stan źródeł i dostępność z historii", async () => {
  const j = await (await worker.fetch(new Request("https://x.test/health"))).json() as object;
  assert.deepEqual(Object.keys(j), ["ok", "name", "version"]);
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ count: 5 })) as typeof fetch;
  const m = new Map<string, string>();
  const r2 = { put: async (k: string, v: string) => { m.set(k, v); }, get: async (k: string) => m.has(k) ? { json: async () => JSON.parse(m.get(k)!) } : null };
  try {
    await zapiszPomiar(r2, Date.now() - 1000);
    const t = await (await worker.fetch(new Request("https://x.test/health", { headers: przegladarka }), { MIGAWKI: r2 } as any)).text();
    assert.match(t, /GUS Bank Danych Lokalnych/); assert.match(t, /✓ działa/); assert.match(t, /100%/);
  } finally { globalThis.fetch = orig; }
});

test("dostepnosc: odsetek udanych pomiarów w oknie, brak pomiarów to null", () => {
  const h = [{ t: 0, w: { A: 1 as const } }, { t: 1000, w: { A: 0 as const } }, { t: 2000, w: { A: 1 as const } }];
  assert.equal(dostepnosc(h, "A", 1500, 2000), 0.5);
  assert.equal(dostepnosc(h, "B", 5000, 2000), null);
});
