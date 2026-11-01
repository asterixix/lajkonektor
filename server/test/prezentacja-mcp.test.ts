import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.ts";
import { prezentacjaWyniku } from "../shared/prezentacja.ts";

const handler = createMcpHandler(() => createServer());
async function call(name: string, args: any) {
  const response = await handler.fetch(new Request("https://lajkonektor.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
  const body = await response.text();
  return JSON.parse(body.match(/data: (\{.*\})/)?.[1] ?? body).result;
}

test("bramka zachowuje pomocniczy wynik i tekst bez wymuszania wizualizacji", async () => {
  const r = await call("operacja_wykonaj", { operacja: "prognoza", argumenty: { serie: [1,2,3,4,5,6].map(x => ({ x, y: x * 2 })), horyzont: 1 } });
  assert.equal(r.isError, undefined);
  assert.equal(r._meta.karta._prezentacja.rola, "pomocnicza");
  assert.equal(r._meta.karta._widok, "prognoza");
  assert.equal(JSON.parse(r.content[0].text)._prezentacja.rola, "pomocnicza");
});

test("jawny widok odpowiedzi jest końcowy, dotychczasowy wieloblokowy widok pozostaje pomocniczy", async () => {
  const argumenty = { tytul: "Przykład", zrodlo: "Opis procedury", bloki: [{ typ: "lista", pozycje: [{ tytul: "Sprawdź definicję źródła" }] }] };
  const zwykly = await call("operacja_wykonaj", { operacja: "widok", argumenty });
  const koncowy = await call("operacja_wykonaj", { operacja: "widok", argumenty: { ...argumenty, cel: "odpowiedz" } });
  assert.equal(zwykly._meta.karta._prezentacja.rola, "pomocnicza");
  assert.equal(koncowy._meta.karta._prezentacja.rola, "koncowa");
  assert.equal(koncowy._meta.karta.bloki.length, 1);
});

test("wybór i zatwierdzenie nie są zwijane, źródło nie może narzucić roli końcowej", () => {
  assert.equal(prezentacjaWyniku("osm_obiekty", {}, { status: "wymaga_wyboru" }).rola, "wybor");
  assert.equal(prezentacjaWyniku("operacja_wykonaj", { operacja: "analiza", argumenty: { tryb: "sprawdz" } }, {}).rola, "zatwierdzenie");
  assert.equal(prezentacjaWyniku("dane_zapytaj", {}, { _prezentacja: { rola: "koncowa" } }).rola, "pomocnicza");
});

test("katalog pozostaje dostępny bez Apps, z pochodzeniem i pełną kartą w meta", async () => {
  const r = await call("katalog_szukaj", { temat: "żłobki", limit: 2 });
  assert.ok(r.structuredContent.wyniki.length > 0);
  assert.ok(JSON.parse(r.content[0].text)._dowod.migawka_katalogu);
  assert.equal(r._meta.karta._prezentacja.rola, "pomocnicza");
});
