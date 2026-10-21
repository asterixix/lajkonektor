import { test } from "node:test";
import assert from "node:assert/strict";
import { stanZapytania, PRZYKLAD_PUSTY } from "../../site/src/stany.ts";
import katalogBrak from "../fixtury/katalog_brak.json" with { type: "json" };
import katalog from "../fixtury/katalog.json" with { type: "json" };

test("pusty wynik katalogu daje stan pusty", () => {
  assert.equal(stanZapytania(katalogBrak, null).typ, "pusty");
});

test("wynik z pozycjami daje stan wynik", () => {
  assert.equal(stanZapytania(katalog, null).typ, "wynik");
});

test("blad daje stan blad z komunikatem", () => {
  const s = stanZapytania(null, new Error("Brak sieci"));
  assert.equal(s.typ, "blad");
  assert.match((s as any).komunikat, /Brak sieci/);
});

test("przyklad podpowiedzi nie jest pusty", () => {
  assert.ok(PRZYKLAD_PUSTY.length > 3);
});
