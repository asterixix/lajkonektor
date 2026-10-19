// Testy integracyjne na żywych API miasta (wymagają internetu). Uruchom: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressToPoint, listParks, mpzpAtPoint, populationWithin } from "../src/core.ts";
import { parkGeometry } from "../src/parki.ts";

// Błonia Krakowskie
const BLONIA = { lat: 50.0585, lon: 19.9186 };

test("parki miejskie: 78 rekordów z nazwą i powierzchnią", async () => {
  const r = await listParks({ rodzaj: "miejskie" });
  assert.ok(r.liczba >= 70, `za mało parków: ${r.liczba}`);
  assert.ok(r.parki.some((p) => p.Nazwa === "Błonia Krakowskie"));
});

test("parki: filtr dzielnicy zawęża wynik", async () => {
  const all = await listParks({ rodzaj: "miejskie" });
  const z = await listParks({ rodzaj: "miejskie", dzielnica: "Zwierzyniec" });
  assert.ok(z.liczba > 0 && z.liczba < all.liczba);
});

test("MPZP w punkcie zwraca przeznaczenia z oznaczeniem", async () => {
  const r = await mpzpAtPoint(BLONIA.lat, BLONIA.lon);
  assert.ok(r.liczba > 0, "brak planu na Błoniach (sprawdź warstwy 1-3)");
  assert.ok(r.przeznaczenia.every((p) => "oznaczenie" in p));
});

test("ludność w promieniu rośnie wraz z promieniem", async () => {
  const a = await populationWithin(50.0614, 19.9372, 300);
  const b = await populationWithin(50.0614, 19.9372, 800);
  assert.ok(a.zameldowani > 0, "Rynek Główny ma zameldowanych");
  assert.ok(b.zameldowani >= a.zameldowani);
  assert.match(a.snapshot, /^\d{4}-\d{2}-\d{2}$/);
});

test("adres_na_punkt: Telimeny 11 i polskie litery bez diakrytyków", async () => {
  const a = await addressToPoint({ ulica: "ul. Telimeny", numer: "11" });
  assert.equal(a.liczba, 1);
  assert.equal(a.kandydaci[0].kod_pocztowy, "30-838");
  const b = await addressToPoint({ ulica: "Lojasiewicza", numer: "4" });
  assert.ok(b.liczba >= 1, "ulica Łojasiewicza nie znaleziona bez diakrytyków");
  const c = await addressToPoint({ ulica: "Nieistniejaca", numer: "999" });
  assert.equal(c.liczba, 0);
});

test("parki_geometria: pokrycie jawne, Błonia mają środek w Krakowie", () => {
  const r = parkGeometry({ nazwa: "Błonia" });
  assert.ok(r.pokrycie.parki_z_geometria > 30 && r.pokrycie.parki_z_geometria < r.pokrycie.parki_ogolem);
  const b = r.parki[0];
  assert.ok(b.osm, "Błonia bez geometrii");
  assert.ok(Math.abs(b.osm.srodek.lat - 50.058) < 0.01 && Math.abs(b.osm.srodek.lon - 19.918) < 0.01);
});

test("adres_na_punkt: ulica bez polskich liter (Dabrowskiego) też działa", async () => {
  const r = await addressToPoint({ ulica: "Dabrowskiego", numer: "12" });
  assert.ok(r.liczba >= 1, "Dąbrowskiego 12 nie znaleziona");
});
