import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.ts";
import { PUBLICZNE, stronaOdpowiedzi } from "../src/kontrakt.ts";
import { pakietRaportu, wczytajRaport, raportJSON } from "../shared/eksport-raportu.ts";

const plan = { tytul: "Próba lokalnej analizy", pytanie: "Ile dzieci jest zameldowanych w dzielnicach?", zrodla: [{ id: "ludnosc", narzedzie: "ludnosc_dzielnic", argumenty: { pola: ["r_0_2"] } }], operacje: [] };
const handler = createMcpHandler(() => createServer(undefined, "https://lajkonektor.test"));
let licznik = 0;
async function rpc(argumenty: any) {
  const name = (PUBLICZNE as readonly string[]).includes("analiza") ? "analiza" : "operacja_wykonaj";
  const args = name === "analiza" ? argumenty : { operacja: "analiza", argumenty };
  const res = await handler.fetch(new Request("https://lajkonektor.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++licznik, method: "tools/call", params: { name, arguments: args } }) }));
  const t = await res.text(); return JSON.parse(t.match(/data: (\{.*\})/)?.[1] ?? t).result;
}
test("raport: pełny przepływ MCP zachowuje kartę i dane do eksportu", async () => {
  const sprawdz = await rpc({ tryb: "sprawdz", plan });
  assert.ok(!sprawdz.isError);
  const s = sprawdz._meta?.karta ?? sprawdz.structuredContent;
  const wykonaj = await rpc({ tryb: "wykonaj", plan, id_planu: s.id_planu, zatwierdzenie: "Zatwierdzam próbę techniczną." });
  assert.ok(!wykonaj.isError, JSON.stringify(wykonaj));
  const d = wykonaj._meta?.karta ?? wykonaj.structuredContent;
  assert.equal(d._widok, "zlozony");
  assert.equal(d._raport_url, "https://lajkonektor.test/?raport=1");
  assert.equal(d.raport.tabele[0].wiersze.length, 18);
  assert.ok(pakietRaportu(d.raport).length > 100);
});
test("raport: kursor stron nie zmienia się wyłącznie przez datę utworzenia", async () => {
  const a = { raport: { utworzono: "2026-10-25T01:00:00Z" }, wiersze: Array.from({ length: 50 }, (_, i) => ({ i, opis: "tekst".repeat(80) })) };
  const p = await stronaOdpowiedzi(a, 4000);
  assert.ok(p.nastepny_kursor);
  const b = { ...a, raport: { utworzono: "2026-10-25T01:00:01Z" } };
  assert.ok(await stronaOdpowiedzi(b, 4000, String(p.nastepny_kursor)));
});
test("raport: puste źródło bez schematu daje otwieralny pakiet", async () => {
  const r: any = { wersja: "1", tytul: "Pusta tabela", pytanie: "Czy są dane?", utworzono: new Date().toISOString(), id_planu: "a", plan: {}, zatwierdzenie: "Próba", tabele: [{ id: "pusta", tytul: "Pusta", kolumny: [], wiersze: [], zrodla: [], uwagi: ["Zero wierszy nie dowodzi braku zjawiska."] }], zrodla: [], metody: [], ograniczenia: [], wnioski: [] };
  assert.equal(wczytajRaport(raportJSON(r)).tabele[0].wiersze.length, 0);
  assert.ok(pakietRaportu(r).length > 100);
});
