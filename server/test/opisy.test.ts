// Kryteria przeglądu konektorów Claude odrzucają opisy, które rozkazują modelu,
// które narzędzie wywołać albo jak się zachować ("instruct Claude to call tools the
// user didn't request", "interfere with Claude calling other tools").
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

// Rozkazy skierowane do modelu: opis ma mówić, co narzędzie robi, nie co model ma zrobić.
const ROZKAZ = /zacznij od|najpierw wywołaj|użyj [a-z_]+ zamiast|nie powtarzaj nim|nie odmawiaj|wywołaj [a-z_]+ nawet/i;

test("opisy: każde narzędzie ma opis i żaden nie każe modelu zacząć od konkretnego narzędzia ani go zmieniać", async () => {
  const { tools } = await rpc("tools/list");
  assert.ok(tools.length === 7, `17 narzędzi, jest ${tools.length}`);
  for (const t of tools) {
    assert.ok(typeof t.description === "string" && t.description.length > 20, `${t.name}: opis jest wymagany`);
    assert.doesNotMatch(t.description, ROZKAZ, `${t.name}: opis rozkazuje modelu, zamiast opisywać narzędzie`);
  }
});
