import { test } from "node:test";
import assert from "node:assert/strict";
import { NARZEDZIA } from "../../site/src/narzedzia.ts";
import { WIDOK } from "../../src/server.ts";

test("wszystkie narzędzia serwera są opisane, osiem jest głównych", () => {
  assert.deepEqual(NARZEDZIA.map((n) => n.nazwa).sort(), Object.keys(WIDOK).sort());
  assert.equal(NARZEDZIA.filter((n) => n.glowne).length, 8);
});

test("grupy i nazwy unikalne", () => {
  assert.equal(new Set(NARZEDZIA.map((n) => n.nazwa)).size, NARZEDZIA.length);
  assert.deepEqual([...new Set(NARZEDZIA.map((n) => n.grupa))].sort(), ["Dane", "Miejsca", "Transport"]);
});

test("opis i świeżość niepuste i bez em/en dash", () => {
  for (const n of NARZEDZIA) {
    assert.ok(n.opis.length > 10 && n.swiezosc.length > 0);
    assert.ok(!/[–—]/.test(n.opis + n.swiezosc));
  }
});
