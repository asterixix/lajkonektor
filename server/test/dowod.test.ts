// Koperta dowodowa wyniku (_dowod), flaga kompletne i wyjaśnienie pustego wyniku (offline: fetch podstawiony).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { pozycje } from "../src/katalog.ts";
import { createServer } from "../src/server.ts";
import { daneZapytaj } from "../src/zapytanie.ts";

const idOd = pozycje.find((p) => p.zrodlo === "od")!.id;

async function zOdpowiedziaOd(odpowiedz: unknown, fn: () => Promise<void>) {
  const oryginal = globalThis.fetch;
  globalThis.fetch = (async () => Response.json(odpowiedz)) as typeof fetch;
  try { await fn(); } finally { globalThis.fetch = oryginal; }
}

test("dane_zapytaj: pusty wynik jest kompletny, ale uwaga mówi, że zero wierszy nie dowodzi braku danych", async () => {
  await zOdpowiedziaOd({ value: [] }, async () => {
    const r = await daneZapytaj({ id: idOd, filtr: "Rok eq 1900" });
    assert.equal(r.wiersze_zwrocone, 0);
    assert.equal(r.kompletne, true);
    assert.match(r.uwagi!.join(" "), /Zero wierszy nie dowodzi braku danych/);
  });
});

test("dane_zapytaj: kolejna strona w źródle oznacza kompletne=false", async () => {
  await zOdpowiedziaOd({ value: [{ a: 1 }], nextLink: "https://x.test/t?$after=abc" }, async () => {
    const r = await daneZapytaj({ id: idOd, limit: 1 });
    assert.equal(r.kompletne, false);
    assert.equal(r.nastepny_kursor, "abc");
  });
});

test("dane_zapytaj: pełna odpowiedź bez kolejnej strony ma kompletne=true i bez uwagi o pustym wyniku", async () => {
  await zOdpowiedziaOd({ value: [{ a: 1 }] }, async () => {
    const r = await daneZapytaj({ id: idOd });
    assert.equal(r.kompletne, true);
    assert.equal(r.uwagi, undefined);
  });
});

test("_dowod: każdy wynik ma czas pobrania w tekście dla modelu, a migawkę katalogu tylko narzędzia katalogowe", async () => {
  const s = createServer() as any;
  const k = await s.wywolaj("katalog_szukaj", { temat: "parki" });
  assert.match(k._dowod.pobrano, /^\d{4}-\d\d-\d\dT/);
  assert.match(k._dowod.migawka_katalogu, /^\d{4}-\d\d-\d\d/);

  const serie = [1, 2, 3, 4, 5, 6].map((x) => ({ x, y: x * 2 }));
  const p = await s.wywolaj("prognoza", { serie, horyzont: 1 });
  assert.equal(p._dowod.migawka_katalogu, undefined);

  const h = createMcpHandler(() => createServer());
  const res = await h.fetch(new Request("https://lajkonektor.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "prognoza", arguments: { serie, horyzont: 1 } } }),
  }));
  const t = await res.text();
  const tekst = JSON.parse(JSON.parse((t.match(/data: (\{.*\})/) ?? [, t])[1]!).result.content[0].text);
  assert.match(tekst._dowod.pobrano, /^\d{4}-\d\d-\d\dT/);
});
