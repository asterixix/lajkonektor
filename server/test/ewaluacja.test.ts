// Zestaw ewaluacyjny (offline): poprawność danych zestawu i oceny. Sam przebieg z modelem: `npm run ewaluacja`.
import { test } from "node:test";
import assert from "node:assert/strict";
import zestaw from "./ewaluacja/pytania.json" with { type: "json" };
import { liczbyZTekstu, nieuziemione, ocen, type Przypadek } from "./ewaluacja/ocena.ts";
import { WIDOK } from "../src/server.ts";

const przypadki = zestaw.przypadki as Przypadek[];

test("zestaw: 50 pytań w 4 kategoriach, unikalne id, poprawne wyrażenia i nazwy narzędzi", () => {
  assert.equal(przypadki.length, 50);
  assert.equal(new Set(przypadki.map((p) => p.id)).size, 50);
  const ile = (k: string) => przypadki.filter((p) => p.kategoria === k).length;
  assert.deepEqual([ile("fakt"), ile("falszywa_przesłanka"), ile("brak_danych"), ile("sprzeciw")], [20, 12, 10, 8]);
  for (const p of przypadki) {
    assert.ok(p.tury.length >= 1 && p.tury.every((t) => t.length > 5), p.id);
    assert.equal(p.tury.length, p.kategoria === "sprzeciw" ? 2 : 1, `${p.id}: sprzeciw to dokładnie dwie tury`);
    for (const n of p.narzedzia_jedno_z ?? []) assert.ok(n in WIDOK, `${p.id}: nieznane narzędzie ${n}`);
    for (const r of [...(p.wymagane ?? []), ...(p.zakazane ?? [])]) assert.doesNotThrow(() => new RegExp(r, "i"), `${p.id}: ${r}`);
    if (p.kategoria !== "fakt") assert.ok(p.wymagane?.length || p.zakazane?.length, `${p.id}: pytanie kontrolne bez kryterium odpowiedzi`);
  }
});

test("liczby: polskie zapisy, mnożniki, a godziny, daty, lata i numeracja nie są liczbami do sprawdzenia", () => {
  assert.deepEqual(liczbyZTekstu("1 234,5 ha i 12,3%"), [1234.5, 12.3]);
  assert.deepEqual(liczbyZTekstu("około 800 tys. osób"), [800_000]);
  assert.deepEqual(liczbyZTekstu("odjazd o 14:35, 3.11.2026", { pomijajMale: true }), []);
  assert.deepEqual(liczbyZTekstu("1. pierwszy\n2. drugi w 2024 roku", { pomijajMale: true }), []);
});

test("uziemienie: liczba z wyniku narzędzia (także zaokrąglona) przechodzi, wymyślona nie", () => {
  const wyniki = [JSON.stringify({ liczba: 126, ha: 21.46, mieszkancow: 804237 })];
  assert.deepEqual(nieuziemione("Jest 126 obiektów, 21,5 ha, ok. 804 tys. osób.", wyniki, "Ile?"), []);
  assert.deepEqual(nieuziemione("Jest 127 obiektów.", wyniki, "Ile?"), [127]);
  assert.deepEqual(nieuziemione("Zgodnie z pytaniem: 25 procent.", [], "Dlaczego jest 25 procent?"), [], "liczba z pierwszego pytania nie jest wymysłem modelu");
});

test("ocena: wymaga narzędzia, wzorców i uziemienia, a powody mówią, co zawiodło", () => {
  const p: Przypadek = { id: "x", kategoria: "brak_danych", tury: ["Ile kin?"], narzedzia_jedno_z: ["katalog_szukaj"], wymagane: ["nie (ma|znalaz)"], zakazane: ["Multikino"] };
  assert.equal(ocen(p, { odpowiedz: "W danych miasta nie ma kin.", narzedzia: ["katalog_szukaj"], wyniki: ["{}"] }).zaliczony, true);
  const z = ocen(p, { odpowiedz: "Jest Multikino, 5 sal i 120 miejsc.", narzedzia: [], wyniki: ["{}"] });
  assert.equal(z.zaliczony, false);
  assert.equal(z.powody.length, 4);
  assert.deepEqual(z.nieuziemione, [120]);
});
