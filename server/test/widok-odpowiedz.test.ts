import { test } from "node:test";
import assert from "node:assert/strict";
import { widokSchema, zlozWidok } from "../src/widok.ts";

const baza = { tytul: "Usługi w dzielnicach", zrodlo: "Opis modelu" };
const z = { narzedzie: "dane_zapytaj" as const, argumenty: { id: "msip:test/0" } };
const bezOdczytu = async () => { throw new Error("Ten widok nie powinien odczytywać źródeł."); };

test("odpowiedź zachowuje cel, a teksty nie zużywają limitu jednej wizualizacji", async () => {
  const a = widokSchema.parse({ ...baza, cel: "odpowiedz", bloki: [
    { typ: "tekst", tekst: "Wynik odczytu." },
    { typ: "lista", pozycje: [{ tytul: "Sprawdź datę stanu źródła" }] },
    { typ: "tekst", tekst: "Ograniczenia interpretacji.", wariant: "uwaga" },
  ] });
  const r = await zlozWidok(a, bezOdczytu);
  assert.equal(r.cel, "odpowiedz");
  assert.deepEqual(r.bloki.map((b) => b.typ), ["tekst", "lista", "tekst"]);
  assert.equal(widokSchema.safeParse({ ...baza, cel: "odpowiedz", bloki: [{ typ: "tekst", tekst: "Brak odpowiedniej wizualizacji." }] }).success, true);
});

test("odpowiedź odrzuca drugą wizualizację, także po rozdzieleniu blokiem tekstowym", async () => {
  const a = { ...baza, cel: "odpowiedz", bloki: [
    { typ: "lista", pozycje: [{ tytul: "Źródła" }] },
    { typ: "tekst", tekst: "Dalszy opis." },
    { typ: "os_czasu", kroki: [{ etykieta: "Weryfikacja" }] },
  ] };
  const p = widokSchema.safeParse(a);
  assert.equal(p.success, false);
  if (!p.success) assert.match(p.error.message, /jedn.*wizualizac/i);
  await assert.rejects(() => zlozWidok(a as any, bezOdczytu), /jedn.*wizualizac/i);
});

test("odpowiedź nie przyjmuje ręcznie wpisanych danych liczbowych zamiast odczytu", () => {
  const reczne = [
    { typ: "tabela", kolumny: ["Dzielnica", "Miejsca"], wiersze: [["Stare Miasto", 9999]] },
    { typ: "wykres", rodzaj: "slupki", punkty: [{ x: "A", y: 9999 }, { x: "B", y: 7777 }] },
    { typ: "mapa", punkty: [{ lat: 50.06, lon: 19.94 }] },
    { typ: "metryki", pozycje: [{ etykieta: "Miejsca", wartosc: 9999 }] },
  ];
  for (const b of reczne) {
    const p = widokSchema.safeParse({ ...baza, cel: "odpowiedz", bloki: [b] });
    assert.equal(p.success, false, b.typ);
  }
  for (const b of reczne.slice(0, 3)) {
    const p = widokSchema.safeParse({ ...baza, cel: "odpowiedz", bloki: [{ ...b, z }] });
    assert.equal(p.success, false, `${b.typ}: ręczne dane nie mogą towarzyszyć z`);
  }
});

test("tabela końcowa bierze wartości, pochodzenie i ograniczenia z rzeczywistego odczytu", async () => {
  const a = widokSchema.parse({ ...baza, cel: "odpowiedz", bloki: [{ typ: "tabela", z, kolumny: ["dzielnica", "miejsca"], limit: 1 }] });
  const r = await zlozWidok(a, async () => ({
    zbior: "msip:test/0", zrodlo: "MSIP, rejestr żłobków", url: "https://msip.krakow.pl/rejestr",
    _dowod: { pobrano: "2026-10-31T12:00:00Z" }, data_stanu: "2026-09-30", kompletne: false,
    uwagi: ["Data stanu dotyczy zameldowania."], ostrzezenia: ["To nie są wolne miejsca."],
    ograniczenia: ["Odczyt obejmuje tylko stronę rejestru."], nastepny_offset: 2,
    wiersze: [{ dzielnica: "Stare Miasto", miejsca: 52 }, { dzielnica: "Grzegórzki", miejsca: null }],
  }));
  assert.equal(r.cel, "odpowiedz");
  assert.equal(r.zrodlo, "MSIP, rejestr żłobków");
  assert.equal(r.kompletne, false);
  assert.equal(r.data_stanu, "2026-09-30");
  assert.deepEqual(r._dowod, { pobrano: "2026-10-31T12:00:00Z" });
  assert.deepEqual(r.bloki[0].wiersze, [["Stare Miasto", 52]]);
  assert.equal(r.bloki[0].razem, 2);
  assert.equal(r.bloki[0].kompletne, false);
  assert.equal(r.nastepny_offset, 2);
  assert.ok(r.uwagi.includes("Data stanu dotyczy zameldowania."));
  assert.match(r.uwagi.join(" "), /1 z 2/);
  assert.deepEqual(r.ostrzezenia, ["To nie są wolne miejsca."]);
  assert.deepEqual(r.ograniczenia, ["Odczyt obejmuje tylko stronę rejestru."]);
  assert.equal(r.pochodzenie.narzedzie, "dane_zapytaj");
  assert.equal(r.pochodzenie.zbior, "msip:test/0");
  assert.equal("wiersze" in r.pochodzenie, false);
});

test("wykres końcowy dziedziczy ostrzeżenia i ujawnia pominięcie brakującej miary", async () => {
  const a = widokSchema.parse({ ...baza, cel: "odpowiedz", bloki: [{ typ: "wykres", rodzaj: "linia", z: { narzedzie: "bdl_dane", argumenty: { zmienne: [1] } } }] });
  const r = await zlozWidok(a, async () => ({
    zrodlo: "GUS BDL", jednostka: "osób", _dowod: { pobrano: "2026-10-31T12:00:00Z" },
    ostrzezenia: ["Dane dla całej gminy, nie dzielnic."],
    wiersze: [{ rok: 2023, wartosc: 12 }, { rok: 2024, wartosc: null }, { rok: 2025, wartosc: 15 }],
  }));
  assert.deepEqual(r.bloki[0].punkty, [{ x: 2023, y: 12 }, { x: 2025, y: 15 }]);
  assert.equal(r.zrodlo, "GUS BDL");
  assert.equal(r.jednostka, "osób");
  assert.deepEqual(r.ostrzezenia, ["Dane dla całej gminy, nie dzielnic."]);
  assert.match(r.uwagi.join(" "), /Pominięto 1/);
});

test("mapa końcowa zachowuje źródłową geometrię i informacje o archiwalności", async () => {
  const a = widokSchema.parse({ ...baza, cel: "odpowiedz", bloki: [{ typ: "mapa", z, kolumna_etykiety: "nazwa" }] });
  const r = await zlozWidok(a, async () => ({
    zrodlo: "MSIP", warstwy: [{ id: "msip:test/0", archiwalne: true, wiek_godzin: 2 }],
    uwaga_migawek: "Użyto archiwalnej migawki.",
    wiersze: [{ nazwa: "Placówka", _geometria: { srodek: { lat: 50.06, lon: 19.94 } } }, { nazwa: "Bez lokalizacji" }],
  }));
  assert.deepEqual(r.bloki[0].wiersze, [{ nazwa: "Placówka", _geometria: { srodek: { lat: 50.06, lon: 19.94 } } }]);
  assert.deepEqual(r.warstwy, [{ id: "msip:test/0", archiwalne: true, wiek_godzin: 2 }]);
  assert.equal(r.uwaga_migawek, "Użyto archiwalnej migawki.");
  assert.match(r.uwagi.join(" "), /Pominięto 1/);
});

test("widok bez celu zachowuje wieloblokowe karty i ręcznie podane liczby", async () => {
  const a = widokSchema.parse({ ...baza, bloki: [
    { typ: "metryki", pozycje: [{ etykieta: "Parki", wartosc: 78 }] },
    { typ: "tabela", kolumny: ["Nazwa", "ha"], wiersze: [["Park", 21]] },
    { typ: "wykres", rodzaj: "slupki", punkty: [{ x: "2024", y: 2 }, { x: "2025", y: 3 }] },
  ] });
  const r = await zlozWidok(a, bezOdczytu);
  assert.equal("cel" in r, false);
  assert.equal("pochodzenie" in r, false);
  assert.deepEqual(r.bloki.map((b) => b.typ), ["metryki", "tabela", "wykres"]);
  assert.deepEqual(r.bloki[1].wiersze, [["Park", 21]]);
});
