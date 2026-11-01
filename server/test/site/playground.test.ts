import { test } from "node:test";
import assert from "node:assert/strict";
import { ZAKLADKI, brakujacePole, podpisWywolania } from "../../site/src/playground.ts";
import { PULA, losuj } from "../../site/src/pytania.ts";
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

test("pula pytań: unikalne, krótkie, wskazują istniejące narzędzie, losowanie bez powtórzeń", () => {
  assert.ok(PULA.length >= 15);
  assert.equal(new Set(PULA.map((p) => p.tekst)).size, PULA.length);
  for (const p of PULA) {
    assert.ok(p.tekst.length > 15 && p.tekst.length < 120, p.tekst);
    assert.ok(p.narzedzie in WIDOK, `brak narzędzia ${p.narzedzie}`);
    assert.doesNotMatch(p.tekst, /[–—]/);
  }
  const wylosowane = losuj(PULA, 3);
  assert.equal(new Set(wylosowane).size, 3);
  assert.deepEqual(losuj([1, 2], 5).sort(), [1, 2]);
  // Skrajne wartości generatora nie wychodzą poza listę.
  assert.deepEqual(losuj([1, 2, 3], 3, () => 0.999999).sort(), [1, 2, 3]);
});
