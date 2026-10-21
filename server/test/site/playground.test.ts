import { test } from "node:test";
import assert from "node:assert/strict";
import { ZAKLADKI, brakujacePole, podpisWywolania } from "../../site/src/playground.ts";
import { TRESC } from "../../site/src/tresc.ts";
import { WIDOK } from "../../src/server.ts";

test("każda zakładka wskazuje narzędzie z rejestru, a fixtura ma pasujący widok", () => {
  assert.equal(ZAKLADKI.length, 4);
  for (const z of ZAKLADKI) {
    assert.ok(z.narzedzie in WIDOK, `brak narzędzia ${z.narzedzie}`);
    assert.equal(z.zapas._widok, WIDOK[z.narzedzie]);
  }
});

test("przykłady wypełniają wszystkie pola i nie są odrzucane przez walidację", () => {
  for (const z of ZAKLADKI) {
    for (const p of z.przyklady) assert.equal(brakujacePole(z, p), null, `${z.id}: ${JSON.stringify(p)}`);
  }
});

test("puste albo jednoznakowe pole jest wychwycone przed wysłaniem", () => {
  const trasa = ZAKLADKI.find((z) => z.id === "trasa")!;
  assert.equal(brakujacePole(trasa, { z: "AGH", do: "" })?.klucz, "do");
  assert.equal(brakujacePole(trasa, { z: "A", do: "Rynek" })?.klucz, "z");
});

test("argumenty trasy mają postać {tekst}, a podpis pokazuje wywołanie", () => {
  const trasa = ZAKLADKI.find((z) => z.id === "trasa")!;
  assert.deepEqual(trasa.args({ z: " AGH ", do: "Rynek Główny" }), { z: { tekst: "AGH" }, do: { tekst: "Rynek Główny" }, max_dojscie_m: 800 });
  assert.match(podpisWywolania(trasa, { z: "AGH", do: "Rynek Główny" }), /^trasa\(\{/);
});

test("kafle mieszkańców mają pytanie do czatu i wskazują istniejące narzędzie", () => {
  for (const k of TRESC.mieszkancy.kafle) {
    assert.ok(k.pytanieAi.length > 15 && k.pytanieAi.length < 200, k.pytanie);
    assert.ok(k.narzedzie in WIDOK, `brak narzędzia ${k.narzedzie}`);
    assert.doesNotMatch(k.pytanieAi, /[–—]/);
  }
});
