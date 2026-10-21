import { test } from "node:test";
import assert from "node:assert/strict";
import { SESJE } from "../../site/src/sesje.ts";
import { WIDOK } from "../../src/server.ts";
import { WIDOKI } from "../../ui/src/widoki/rejestr.ts";

test("są trzy sesje o unikalnych id", () => {
  assert.equal(SESJE.length, 3);
  assert.equal(new Set(SESJE.map((s) => s.id)).size, 3);
});

test("każda sesja wskazuje narzędzie z WIDOK i widok z rejestru kart", () => {
  for (const s of SESJE) {
    assert.ok(s.narzedzie in WIDOK, `brak narzędzia ${s.narzedzie}`);
    assert.equal(s.wynik._widok, WIDOK[s.narzedzie], `_widok nie zgadza się z WIDOK dla ${s.narzedzie}`);
    assert.ok((s.wynik._widok as string) in WIDOKI, `brak karty ${s.wynik._widok}`);
  }
});

test("wynik sesji ma podsumowanie i zapytanie", () => {
  for (const s of SESJE) {
    assert.equal(typeof s.wynik.podsumowanie, "string");
    assert.ok(s.wynik._zapytanie, "brak _zapytanie");
  }
});
