import { test } from "node:test";
import assert from "node:assert/strict";
import { adresMcp } from "../../site/src/adres.ts";

test("adres MCP to origin z /mcp", () => {
  assert.equal(adresMcp("https://lajkonektor.sendyka.workers.dev"), "https://lajkonektor.sendyka.workers.dev/mcp");
  assert.equal(adresMcp("https://lajkonektor.sendyka.workers.dev/"), "https://lajkonektor.sendyka.workers.dev/mcp");
});
