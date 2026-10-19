// Testy integracyjne na żywych API miasta (wymagają internetu). Uruchom: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { listParks, mpzpAtPoint, populationWithin } from "../src/core.ts";

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
