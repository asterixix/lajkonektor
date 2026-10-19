// Testy MCP Apps po stronie serwera (offline): metadane narzędzi, zasób ui:// i opakowanie wyniku dla karty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { WIDOK, createServer } from "../src/server.ts";
import { NAZWY_WIDOKOW } from "../ui/src/widoki/nazwy.ts";

const KARTA = "ui://lajkonektor/karta.html";
const handler = createMcpHandler(() => createServer());
let id = 0;
async function rpc(method: string, params: unknown = {}): Promise<any> {
  const r = await handler.fetch(new Request("https://lajkonektor.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  }));
  const t = await r.text();
  const m = t.match(/data: (\{.*\})/);
  return JSON.parse(m ? m[1] : t).result;
}

test("MCP Apps: każde narzędzie wskazuje kartę (klucz zagnieżdżony i starszy), a pomocnicze jest ukryte przed modelem", async () => {
  const { tools } = await rpc("tools/list");
  for (const t of tools) {
    assert.equal(t._meta?.ui?.resourceUri, KARTA, `${t.name}: _meta.ui.resourceUri`);
    assert.equal(t._meta?.["ui/resourceUri"], KARTA, `${t.name}: _meta["ui/resourceUri"] (starsi klienci)`);
  }
  const ukryte = tools.filter((t: any) => t._meta.ui.visibility?.length === 1 && t._meta.ui.visibility[0] === "app");
  assert.deepEqual(ukryte.map((t: any) => t.name), ["ui_kontury_parkow"]);
  const publiczne = tools.filter((t: any) => !ukryte.includes(t)).map((t: any) => t.name).sort();
  assert.deepEqual(publiczne, Object.keys(WIDOK).sort(), "każde narzędzie publiczne ma przypisany widok i odwrotnie");
});

test("MCP Apps: każdy widok z WIDOK ma kartę w paczce UI", () => {
  for (const [narzedzie, widok] of Object.entries(WIDOK)) assert.ok((NAZWY_WIDOKOW as readonly string[]).includes(widok), `${narzedzie} → ${widok}`);
});

test("MCP Apps: zasób ui:// to samodzielny HTML z właściwym typem MIME i bez zewnętrznych domen", async () => {
  const { resources } = await rpc("resources/list");
  assert.deepEqual(resources.map((r: any) => [r.uri, r.mimeType]), [[KARTA, "text/html;profile=mcp-app"]]);
  const { contents } = await rpc("resources/read", { uri: KARTA });
  const [c] = contents;
  assert.equal(c.mimeType, "text/html;profile=mcp-app");
  assert.match(c.text, /^<!doctype html>/i);
  assert.ok(c.text.includes('id="app"') && c.text.includes("@font-face"), "CSS, czcionki i skrypt są w środku");
  assert.deepEqual(c._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
  assert.doesNotMatch(c.text, /<(script|link)[^>]+(src|href)="https?:/i, "żadnych zewnętrznych skryptów ani arkuszy");
});

test("MCP Apps: wynik niesie tekst z podsumowaniem dla klientów bez UI i structuredContent z widokiem dla karty", async () => {
  const args = { serie: Array.from({ length: 8 }, (_, i) => ({ x: 2018 + i, y: 100 + 5 * i })), horyzont: 2, etykieta: "Test" };
  const r = await rpc("tools/call", { name: "prognoza", arguments: args });
  assert.ok(!r.isError);
  const tekst = JSON.parse(r.content[0].text);
  assert.equal(typeof tekst.podsumowanie, "string");
  assert.ok(tekst.podsumowanie.length > 20);
  assert.equal(r.structuredContent._widok, "prognoza");
  assert.deepEqual(r.structuredContent._zapytanie.serie, args.serie); // reszta to argumenty z domyślnymi wartościami z zod
  assert.equal(r.structuredContent.podsumowanie, tekst.podsumowanie);
});
