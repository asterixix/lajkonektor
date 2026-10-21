import { test } from "node:test";
import assert from "node:assert/strict";
import { NARZEDZIA } from "../../site/src/narzedzia.ts";
import { WIDOK } from "../../src/server.ts";

test("osiem narzędzi, każde znane serwerowi", () => {
  assert.equal(NARZEDZIA.length, 8);
  for (const n of NARZEDZIA) assert.ok(n.nazwa in WIDOK, `brak narzędzia ${n.nazwa}`);
});

test("grupy i nazwy unikalne", () => {
  assert.equal(new Set(NARZEDZIA.map((n) => n.nazwa)).size, 8);
  assert.deepEqual([...new Set(NARZEDZIA.map((n) => n.grupa))], ["Dane", "Transport", "Miejsca"]);
});

test("opis i świeżość niepuste i bez em/en dash", () => {
  for (const n of NARZEDZIA) {
    assert.ok(n.opis.length > 10 && n.swiezosc.length > 0);
    assert.ok(!/[\u2013\u2014]/.test(n.opis + n.swiezosc));
  }
});
