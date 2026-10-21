import { test } from "node:test";
import assert from "node:assert/strict";
import { TRESC, ZAKAZANE, policzSlowa } from "../../site/src/tresc.ts";
import { WIDOK } from "../../src/server.ts";
import katalog from "../../data/katalog.json" with { type: "json" };

// Zbiera wszystkie teksty ze struktury, poza adresami URL.
function teksty(o: unknown, wynik: string[] = []): string[] {
  if (typeof o === "string") wynik.push(o);
  else if (Array.isArray(o)) o.forEach((x) => teksty(x, wynik));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (k !== "url" && k !== "href" && k !== "id" && k !== "narzedzie") teksty(v, wynik);
  return wynik;
}
const wszystkie = teksty(TRESC);

test("teksty strony nie zawierają pauz ani słów zakazanych", () => {
  assert.ok(wszystkie.length > 50);
  for (const tekst of wszystkie) {
    assert.doesNotMatch(tekst, /[–—]/, tekst);
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
    assert.ok(b.zrodla.length > 0, `blok ${b.etykieta} bez źródła`);
  }
  assert.ok(policzSlowa(TRESC.ograniczenia.opis) <= 25);
});

test("liczby na pasku zgadzają się z katalogiem i rejestrem narzędzi", () => {
  const [zbiory, narzedzia] = TRESC.pasek;
  assert.equal(zbiory.liczba, String(katalog.pozycje.length));
  assert.equal(narzedzia.liczba, String(Object.keys(WIDOK).length));
});

test("koszt jest wyraźnie oznaczony jako szacunek, bez przypisywania go prototypowi", () => {
  const blok = TRESC.dlaMiasta.bloki.find((b) => b.etykieta === "Koszt");
  assert.ok(blok);
  assert.match(blok.tekst, /szacunek, nie pomiar/i);
  assert.match(blok.tekst, /30 ms CPU/);
  assert.doesNotMatch(blok.tekst, /koszt prototypu/i);
});

test("bez niezweryfikowanych cytatów osób publicznych i wycofanych twierdzeń", () => {
  for (const tekst of wszystkie) {
    assert.doesNotMatch(tekst, /Garc[eé]s|Bu[lł]ka/i);
    // Seul, Toronto i Kirkland nie potwierdziły się w źródłach (docs/01-discovery/argumenty-dla-miasta.md).
    assert.doesNotMatch(tekst, /Seul|Toronto|Kirkland/i, tekst);
    // Raport GSA podaje 0% i 2,1%, nie 5%.
    assert.doesNotMatch(tekst, /\b5% (odpowiedzi|bez MCP)/i, tekst);
  }
});

test("każdy dowód i kafel mieszkańca ma źródło lub akcję", () => {
  for (const d of TRESC.dlaczego.dowody) assert.match(d.zrodlo.url, /^https:\/\//);
  assert.match(TRESC.mieszkancy.zrodlo.url, /^https:\/\//);
  for (const k of TRESC.mieszkancy.kafle) assert.ok(k.narzedzie in WIDOK, `brak narzędzia ${k.narzedzie}`);
});
