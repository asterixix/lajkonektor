// Jedno źródło wersji: /diag, /health, logi upstreamu i initialize muszą mówić to samo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { WERSJA } from "../src/wersja.ts";
import { createServer } from "../src/server.ts";
import worker from "../src/index.ts";

let id = 0;
const handler = createMcpHandler(() => createServer());

test("wersja: initialize i /health podają tę samą wartość z jednego modułu", async () => {
  const r = await handler.fetch(new Request("https://lajkonektor.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
  }));
  const m = (await r.text()).match(/data: (\{.*\})/);
  const init = JSON.parse(m ? m[1] : "").result;
  assert.equal(init.serverInfo.version, WERSJA, "initialize");

  const h = await worker.fetch(new Request("https://lajkonektor.test/health"));
  assert.equal((await h.json() as { version: string }).version, WERSJA, "/health");
});
