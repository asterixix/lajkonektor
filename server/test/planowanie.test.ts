import { test } from "node:test";
import assert from "node:assert/strict";
import { planowanieWPunkcie } from "../src/planowanie.ts";

// Atrapa fetch: wskazane warstwy zwracają błąd ArcGIS w HTTP 200 (tak zachowuje się serwer MSIP), reszta pusty wynik.
async function zAtrapa<T>(psuj: RegExp, fn: () => Promise<T>): Promise<T> {
  const oryginal = globalThis.fetch;
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    return new Response(JSON.stringify(psuj.test(url) ? { error: { message: "Błąd warstwy", code: 500 } } : { features: [] }), { status: 200 });
  }) as typeof fetch;
  try { return await fn(); } finally { globalThis.fetch = oryginal; }
}
const metryki = (w: any) => w.bloki.find((b: any) => b.typ === "metryki").pozycje as { etykieta: string; wartosc: string }[];
const MIEJSCE = { lat: 50.0614, lon: 19.9372, etykieta: "Rynek" };

test("planowanie: niedostępna warstwa MPZP to „nie sprawdzono”, nie „brak planu”", async () => {
  const w = await zAtrapa(/BP_MPZP/, () => planowanieWPunkcie(MIEJSCE));
  assert.equal(metryki(w).find((p) => p.etykieta === "Miejscowy plan")!.wartosc, "nie sprawdzono");
  const tekst = JSON.stringify(w.bloki);
  assert.doesNotMatch(tekst, /nie ma obowiązującego miejscowego planu/);
  assert.match(tekst, /Brak wyniku nie oznacza braku planu/);
  assert.ok(w.plan.niedostepne.length >= 3);
});

test("planowanie: sprawna warstwa bez trafienia to „brak”, a niedostępna warstwa obszaru w tabeli to „nie sprawdzono”", async () => {
  const w = await zAtrapa(/UNESCO|Unesco/, () => planowanieWPunkcie(MIEJSCE));
  assert.equal(metryki(w).find((p) => p.etykieta === "Miejscowy plan")!.wartosc, "brak");
  const tabela = w.bloki.find((b: any) => b.typ === "tabela" && /Obszary specjalne/.test(b.tytul));
  const unesco = tabela.wiersze.filter((r: string[]) => /UNESCO/.test(r[0]));
  assert.ok(unesco.length >= 1 && unesco.every((r: string[]) => r[1] === "nie sprawdzono"), JSON.stringify(unesco));
  const studium = tabela.wiersze.find((r: string[]) => /Studium/.test(r[0]));
  assert.equal(studium[1], "nie");
});

test("dostepnosc: miejsce z usługą pokazuje najbliższe obiekty tej usługi, a nie standardy planu", async () => {
  const { dostepnosc } = await import("../src/analizy.ts");
  const oryginal = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ features: [{ attributes: { nazwa: "Apteka Testowa", adres: "Rynek 1" }, geometry: { x: 19.9375, y: 50.0617 } }] }), { status: 200 })) as typeof fetch;
  try {
    const w = await dostepnosc({ miejsce: { lat: 50.0614, lon: 19.9372, etykieta: "Rynek" }, usluga: "apteka" });
    assert.match(w.tytul, /Apteki w pobliżu/);
    assert.doesNotMatch(w.tytul, /Standardy/);
    assert.match(JSON.stringify(w.bloki), /Apteka Testowa/);
  } finally { globalThis.fetch = oryginal; }
});

test("obiekty: warstwa ponad limitem 2000 daje błąd zamiast po cichu niepełnej listy", async () => {
  const { obiektyRodzaju } = await import("../src/analizy.ts");
  const oryginal = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ features: [], exceededTransferLimit: true }), { status: 200 })) as typeof fetch;
  try { await assert.rejects(obiektyRodzaju("apteka"), /niepełna/); } finally { globalThis.fetch = oryginal; }
});
