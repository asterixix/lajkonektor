import { test } from "node:test";
import assert from "node:assert/strict";
import { obsluzWywolanie } from "../src/api.ts";
import { createServer } from "../src/server.ts";

const serwer = createServer(undefined, "https://example.test") as any;
const nieblokuj = async () => false;
const opcje = (extra: object = {}) => ({ wywolaj: serwer.wywolaj, ip: "9.9.9.9", licznik: nieblokuj, ...extra });
const zadanie = (cialo: unknown, metoda = "POST") =>
  new Request("https://example.test/api/wywolaj", { method: metoda, headers: { "content-type": "application/json" }, body: typeof cialo === "string" ? cialo : JSON.stringify(cialo) });

test("200 z _widok dla poprawnego wywołania", async () => {
  const r = await obsluzWywolanie(zadanie({ nazwa: "katalog_szukaj", argumenty: { temat: "przedszkola", limit: 2 } }), opcje());
  assert.equal(r.status, 200);
  const j = await r.json() as any;
  assert.equal(j._widok, "katalog");
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});

test("400 dla zepsutego JSON", async () => {
  assert.equal((await obsluzWywolanie(zadanie("{nie json"), opcje())).status, 400);
});

test("400 dla brakującej nazwy i nieobiektowych argumentów", async () => {
  assert.equal((await obsluzWywolanie(zadanie({ argumenty: {} }), opcje())).status, 400);
  assert.equal((await obsluzWywolanie(zadanie({ nazwa: "katalog_szukaj", argumenty: "x" }), opcje())).status, 400);
});

test("400 dla nieznanego narzędzia i złych argumentów, bez stack trace", async () => {
  const a = await obsluzWywolanie(zadanie({ nazwa: "nie_ma" }), opcje());
  assert.equal(a.status, 400);
  const b = await obsluzWywolanie(zadanie({ nazwa: "katalog_szukaj", argumenty: { temat: 5 } }), opcje());
  assert.equal(b.status, 400);
  assert.ok(!(await b.text()).includes("    at "));
});

test("405 dla metody innej niż POST", async () => {
  const get = new Request("https://example.test/api/wywolaj", { method: "GET" });
  assert.equal((await obsluzWywolanie(get, opcje())).status, 405);
});

test("429 z retry-after, gdy licznik zgłosi przekroczenie", async () => {
  const r = await obsluzWywolanie(zadanie({ nazwa: "katalog_szukaj", argumenty: { temat: "x" } }), opcje({ licznik: async () => true }));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "60");
});

test("502 gdy źródło rzuca nieoczekiwany błąd, komunikat po polsku", async () => {
  const r = await obsluzWywolanie(zadanie({ nazwa: "katalog_szukaj", argumenty: { temat: "x" } }), opcje({ wywolaj: async () => { throw new Error("HTTP 522 Origin error"); } }));
  assert.equal(r.status, 502);
  const j = await r.json() as any;
  assert.match(j.blad, /Źródło/);
});

test("422 z komunikatem narzędzia, gdy błąd dotyczy pytania (np. brak przystanku), a nie źródła", async () => {
  const r = await obsluzWywolanie(zadanie({ nazwa: "odjazdy", argumenty: { nazwa: "Basztowa" } }), opcje({ wywolaj: async () => { throw new Error("Nie znaleziono przystanków dla podanych kryteriów."); } }));
  assert.equal(r.status, 502);
  assert.match(((await r.json()) as any).blad, /Źródło/);
});

test("błędy techniczne i wyjątki programu nie wyciekają do użytkownika", async () => {
  for (const msg of ["ArcGIS: Invalid query (X)", "Nominatim HTTP 429", "The operation was aborted", "Cannot read properties of undefined (reading 'x')"]) {
    const r = await obsluzWywolanie(zadanie({ nazwa: "katalog_szukaj", argumenty: { temat: "x" } }), opcje({ wywolaj: async () => { throw new Error(msg); } }));
    assert.equal(r.status, 502, msg);
    assert.match(((await r.json()) as any).blad, /Źródło/);
  }
});
