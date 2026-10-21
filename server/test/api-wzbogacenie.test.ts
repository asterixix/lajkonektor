import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.ts";

// wywolaj zwraca wynik z widokiem, zapytaniem i podsumowaniem, jak wynik MCP.
test("wywolaj dodaje _widok, _zapytanie i podsumowanie", async () => {
  const s = createServer(undefined, "https://example.test") as any;
  const w = await s.wywolaj("katalog_szukaj", { temat: "przedszkola", limit: 2 });
  assert.equal(w._widok, "katalog");
  assert.deepEqual(w._zapytanie, { temat: "przedszkola", limit: 2 });
  assert.equal(typeof w.podsumowanie, "string");
  assert.equal(w._kafelki, "https://example.test/kafelki/{z}/{x}/{y}.png");
});

test("wywolaj odrzuca nieznane narzędzie i złe argumenty po polsku", async () => {
  const s = createServer() as any;
  await assert.rejects(s.wywolaj("nie_ma_takiego", {}), /nieznane narzędzie/);
  await assert.rejects(s.wywolaj("katalog_szukaj", { temat: 1 }), /argumenty katalog_szukaj/);
});
