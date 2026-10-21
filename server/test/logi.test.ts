// Błąd narzędzia wraca modelowi jako isError, ale bez śladu po stronie serwera nie dało
// się odróżnić „źródło padło" od „mój błąd" — a finale polega na nagraniu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.ts";

let id = 0;
const handler = createMcpHandler(() => createServer());
async function rpc(method: string, params: unknown = {}): Promise<any> {
  const r = await handler.fetch(new Request("https://lajkonektor.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  }));
  const t = await r.text();
  const m = t.match(/data: (\{.*\})/);
  return JSON.parse(m ? m[1] : t).result;
}

// Łapie wszystko, co handler wypisze na console.error w czasie jednego wywołania.
async function zLogami(fn: () => Promise<void>): Promise<string[]> {
  const oryginalny = console.error;
  const linie: string[] = [];
  console.error = (...a: unknown[]) => linie.push(a.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = oryginalny;
  }
  return linie;
}

test("logi: błąd narzędzia zostaje wpis JSON z nazwą narzędzia", async () => {
  const linie = await zLogami(async () => {
    await rpc("tools/call", { name: "zbior_opis", arguments: { id: "nieistniejacy-zbior" } });
  });

  assert.equal(linie.length, 1, `oczekiwany jeden wpis, jest ${linie.length}: ${linie.join(" | ")}`);
  const wpis = JSON.parse(linie[0]);
  assert.equal(wpis.narzedzie, "zbior_opis");
  assert.ok(typeof wpis.blad === "string" && wpis.blad.length > 0, "wpis musi nosić przyczynę");
});

test("logi: udane wywołanie nic nie loguje", async () => {
  const linie = await zLogami(async () => {
    await rpc("tools/call", { name: "katalog_szukaj", arguments: { temat: "parki" } });
  });

  assert.deepEqual(linie, []);
});
