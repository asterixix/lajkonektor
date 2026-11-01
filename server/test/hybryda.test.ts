import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.ts";
import { PUBLICZNE, stronaOdpowiedzi } from "../src/kontrakt.ts";
const h = createMcpHandler(() => createServer());
async function rpc(method: string, params: unknown = {}) {
  const r = await h.fetch(new Request("https://x/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json,text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
  const t = await r.text(); return JSON.parse(t.match(/data: (\{.*\})/)?.[1] ?? t).result;
}
test("MCP: dokładnie siedem narzędzi, każde ma outputSchema", async () => {
  const r = await rpc("tools/list"); assert.deepEqual(r.tools.map((t: any) => t.name).sort(), [...PUBLICZNE].sort());
  assert.ok(r.tools.every((t: any) => t.outputSchema));
});
test("bramka: odkrywa maksymalnie 3 schematy i odrzuca niezarejestrowaną operację", async () => {
  const r = await rpc("tools/call", { name: "operacje_szukaj", arguments: { temat: "transport trasa odjazdy przystanki" } });
  assert.ok(r.structuredContent.operacje.length <= 3); assert.ok(r.structuredContent.operacje.length > 0);
  assert.ok(r.structuredContent.operacje.every((o: any) => o.inputSchema && o.outputSchema));
  const e = await rpc("tools/call", { name: "operacja_wykonaj", arguments: { operacja: "eval", argumenty: {} } }); assert.equal(e.isError, true);
});
test("bramka: odkrywa operację analiza mimo pola raport w jej schemacie wyniku", async () => {
  const r = await rpc("tools/call", { name: "operacje_szukaj", arguments: { temat: "analiza" } });
  assert.notEqual(r.isError, true);
  assert.ok(r.structuredContent.operacje.some((o: any) => o.nazwa === "analiza" && o.outputSchema.properties.raport));
});
test("bramka: błąd silnika analiz wraca z treścią do poprawy planu, a nie jako ogólne „niedostępne”", async () => {
  const plan = { tytul: "Test", pytanie: "Ludność dzielnic", zrodla: [{ id: "l", narzedzie: "ludnosc_dzielnic", argumenty: {}, data_stanu: "do potwierdzenia" }], operacje: [], ograniczenia: [] };
  const s = await rpc("tools/call", { name: "operacja_wykonaj", arguments: { operacja: "analiza", argumenty: { tryb: "sprawdz", plan } } });
  assert.equal(s.isError, true);
  assert.match(s.structuredContent.komunikat, /różni się od migawki ludności/);
});
test("opisy schematów zachowują pola sterujące geometrią", async () => {
  const r = await rpc("tools/call", { name: "operacje_szukaj", arguments: { temat: "dane_zapytaj" } });
  const o = r.structuredContent.operacje.find((x: any) => x.nazwa === "dane_zapytaj");
  assert.ok(o.inputSchema.properties.kontury);
});
test("strony: polski JSON mieści się w bajtach, zachowuje źródła i odzyskuje wszystkie fragmenty", async () => {
  const dane = { zrodlo: "UMK", uwagi: ["częściowe pokrycie"], wiersze: Array.from({ length: 2000 }, (_, n) => ({ n, tekst: "ąćęłńóśźż".repeat(20) })) };
  let k: string | undefined; const fragmenty: any[] = [];
  do { const r = await stronaOdpowiedzi(dane, 24 * 1024, k); assert.ok(new TextEncoder().encode(JSON.stringify(r)).length <= 24 * 1024); assert.ok(JSON.stringify(r.dowody_i_ograniczenia).includes("UMK")); fragmenty.push(...r.fragmenty); k = r.nastepny_kursor ?? undefined; } while (k);
  assert.equal(fragmenty.filter(x => x.sciezka[0] === "wiersze").length, 2000);
});
test("strony: zmiana wieku migawki nie zmienia tożsamości danych", async () => {
  const dane = { warstwy: [{ id: "x", kompletne: true, dostepna: true, wiek_s: 1 }], wiersze: Array.from({ length: 300 }, (_, n) => ({ n, tekst: "ą".repeat(300) })) };
  const a = await stronaOdpowiedzi(dane, 24 * 1024);
  dane.warstwy[0].wiek_s = 2;
  const b = await stronaOdpowiedzi(dane, 24 * 1024, a.nastepny_kursor);
  assert.ok(b.fragmenty.length > 0);
});
test("raport: kontrakt modelu nie gubi wierszy tabeli wynikowej", async () => {
  const wiersze = Array.from({ length: 40 }, (_, i) => ({ i }));
  const dane = { raport: { wersja: "1", plan: { operacje: [] }, tabele: [{ id: "wynik", wiersze, kolumny: ["i"], zrodla: [] }] } };
  const r = await stronaOdpowiedzi(dane, 24 * 1024);
  assert.equal(r.raport.tabele[0].wiersze.length, 40);
});
