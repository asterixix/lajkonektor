import { test } from "node:test";
import assert from "node:assert/strict";
import { TRESC, ZAKAZANE, policzSlowa } from "../../site/src/tresc.ts";

function wszystkieTeksty(): string[] {
  const t = [TRESC.hero.naglowek, TRESC.hero.podtytul, TRESC.hero.cta, ...TRESC.hero.zapasowe];
  t.push(TRESC.odtwarzacz.naglowek, ...TRESC.odtwarzacz.pytania);
  t.push(TRESC.rozkladNarzedzi.naglowek, TRESC.rozkladNarzedzi.opis);
  t.push(TRESC.czegoNieWiemy.naglowek, TRESC.czegoNieWiemy.opis);
  t.push(TRESC.dlaMiasta.naglowek);
  for (const b of TRESC.dlaMiasta.bloki) t.push(b.etykieta, b.naglowek, b.tekst);
  t.push(TRESC.podlaczenie.naglowek, ...TRESC.podlaczenie.kroki, TRESC.podlaczenie.kopiuj, TRESC.podlaczenie.skopiowano);
  t.push(TRESC.stopka);
  return t;
}

test("teksty strony nie zawierają pauz ani słów zakazanych", () => {
  for (const tekst of wszystkieTeksty()) {
    assert.doesNotMatch(tekst, /[\u2013\u2014]/, tekst);
    for (const slowo of ZAKAZANE) assert.doesNotMatch(tekst, new RegExp(slowo, "i"), `${slowo}: ${tekst}`);
  }
});

test("nagłówek, podtytuł i CTA mieszczą się w limitach", () => {
  assert.ok(policzSlowa(TRESC.hero.naglowek) <= 8);
  assert.ok(policzSlowa(TRESC.hero.podtytul) <= 20);
  assert.ok(policzSlowa(TRESC.hero.cta) <= 3);
  for (const b of TRESC.dlaMiasta.bloki) {
    assert.ok(policzSlowa(b.naglowek) <= 8, b.naglowek);
    assert.ok(policzSlowa(b.tekst) <= 60, b.naglowek);
  }
  assert.ok(policzSlowa(TRESC.czegoNieWiemy.opis) <= 25);
});

test("koszt jest wyraźnie oznaczony jako szacunek, bez przypisywania go prototypowi", () => {
  const blok = TRESC.dlaMiasta.bloki.find((b) => b.etykieta === "Koszt");
  assert.ok(blok);
  assert.match(blok.tekst, /szacunek, nie pomiar/i);
  assert.match(blok.tekst, /30 ms CPU/);
  assert.doesNotMatch(blok.tekst, /koszt prototypu/i);
});

test("bez niezweryfikowanych cytatów osób publicznych", () => {
  for (const tekst of wszystkieTeksty()) assert.doesNotMatch(tekst, /Garc[eé]s|Bu[lł]ka/i);
});
