import { test } from "node:test";
import assert from "node:assert/strict";
import { adresPodgladu, argumentyPodgladu, odczytajPodglad } from "../shared/podglad.ts";

test("podgląd: adres trzyma zapytanie w części #, którą przeglądarka nie wysyła na serwer", () => {
  const u = new URL(adresPodgladu("https://lajkonektor.test", { id: "msip:Transport/ZTP_Komunikacja_Miejska_i_Rowerowa/5", widok: "mapa" }));
  assert.equal(u.search, "?podglad=1");
  assert.deepEqual(odczytajPodglad(u.hash), { id: "msip:Transport/ZTP_Komunikacja_Miejska_i_Rowerowa/5", widok: "mapa" });
});

test("podgląd: odrzuca obce adresy, nieznane widoki i wyjście poza ścieżkę", () => {
  for (const h of ["#id=https://evil.example&widok=dane", "#id=msip:a/../../x&widok=mapa", "#id=od:abc&widok=skrypt", "#widok=dane", "", "#id=od:<script>&widok=dane"]) {
    assert.equal(odczytajPodglad(h), null, h);
  }
});

test("podgląd: mapa czyta uproszczone kontury do rysowania, dane do 1000 wierszy, opis przez zbior_opis", () => {
  assert.deepEqual(argumentyPodgladu({ id: "msip:a/b/1", widok: "mapa" }), { nazwa: "dane_zapytaj", argumenty: { id: "msip:a/b/1", limit: 200, kontury: true } });
  assert.deepEqual(argumentyPodgladu({ id: "od:a/b", widok: "dane" }).argumenty, { id: "od:a/b", limit: 1000 });
  assert.equal(argumentyPodgladu({ id: "od:a/b", widok: "opis" }).nazwa, "zbior_opis");
});
