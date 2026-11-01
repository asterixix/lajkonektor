import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { eksportDanychSchema, eksportujDane } from "../src/eksport-danych.ts";
import { wykonajAnalize } from "../src/raport.ts";
import { nazwaPakietuDanych, pakietDanychZIP, wczytajPakietDanych } from "../shared/eksport-danych.ts";
import { tabelaCSV } from "../shared/eksport-raportu.ts";

const z = { narzedzie: "dane_zapytaj", argumenty: { id: "msip:test" } };
const wiersze = [{ id: 1, n: 4 }, { id: 2, n: null }];
const fn = async (nazwa: string) => nazwa === "zbior_opis" ? { pola: ["id:Integer", "n:Double"] } : {
  wiersze, kompletne: true, zrodlo: "Źródło testowe", url: "https://dane.krakow.pl/test", data_stanu: "2026-01-01",
  definicja: "Wartość testowa", jednostka: "osób", poziom: "dzielnica", _dowod: { pobrano: "2026-10-31T10:00:00Z" },
};
const plan = () => ({
  tytul: "Dane do porównania", pytanie: "Jakie są sumy?", zrodla: [{ id: "a", ...z }],
  operacje: [{ id: "sumy", typ: "agreguj", z: "a", grupuj_po: [], miary: [{ pole: "n", fn: "sum", nazwa: "suma" }] }],
});

test("eksport odczytu nie tworzy raportu ani deklaracji zatwierdzenia; zachowuje pełne strony i pochodzenie", async () => {
  const calls: string[] = [];
  const wynik = await eksportujDane({ z }, async (nazwa, args: any) => {
    calls.push(nazwa);
    assert.equal(nazwa, "dane_zapytaj");
    return { ...await fn(nazwa), wiersze: args.kursor ? [{ id: 2, n: null }] : [{ id: 1, n: 4, _geometria: { lat: 50, lon: 20 } }], kompletne: !!args.kursor, ...(!args.kursor ? { nastepny_kursor: "dalej" } : {}) };
  });
  const p = wynik.pakiet_danych;
  assert.deepEqual(calls, ["dane_zapytaj", "dane_zapytaj"]);
  assert.deepEqual(p.tabele[0].wiersze, wiersze);
  assert.equal(p.tabele[0].rodzaj, "odczytana");
  assert.equal(p.tabele[0].kompletne, true);
  assert.equal(p.odczyt, "ponowiony");
  assert.equal("raport" in wynik, false);
  assert.equal("zatwierdzenie" in p, false);
  assert.equal("plan" in p, false);
  assert.equal(p.zrodla[0].pobrano, "2026-10-31T10:00:00Z");
  assert.equal(p.zrodla[0].data_stanu, "2026-01-01");
  assert.equal(p.zrodla[0].definicja, "Wartość testowa");
  assert.equal(p.zrodla[0].url, "https://dane.krakow.pl/test");
  assert.deepEqual(p.zrodla[0].argumenty, z.argumenty);
  assert.match(p.ograniczenia.join(" "), /ponaw|ponown|ponowion/i);
});

test("schemat eksportu odrzuca dowolny kod, nieznane operacje, częściowy początek i fałszywe zatwierdzenie odczytu", () => {
  for (const args of [
    { z: { narzedzie: "analiza", argumenty: {} } },
    { z, wiersze }, { z, zatwierdzenie: "Tak" }, { z, plan: plan() },
    { z: { ...z, argumenty: { ...z.argumenty, kod: "return 1" } } },
    { z: { ...z, argumenty: { ...z.argumenty, offset: 50 } } },
    { z: { ...z, argumenty: { ...z.argumenty, kursor: "dalej" } } },
    { z: { narzedzie: "plik_odczyt", argumenty: { url: "https://example.com/dane.csv" } } },
  ]) assert.equal(eksportDanychSchema.safeParse(args).success, false, JSON.stringify(args));
  assert.equal(eksportDanychSchema.safeParse({ z }).success, true);
});

test("eksport planu wymaga rzeczywistego id i deklaracji, zachowuje tabele odczytane i przeliczone oraz null", async () => {
  const p = plan();
  await assert.rejects(() => eksportujDane({ plan: p }, fn), /zatwierdzenie|id_planu|Invalid input/i);
  const sprawdzony = await wykonajAnalize({ tryb: "sprawdz", plan: p }, fn);
  const wynik = await eksportujDane({ plan: p, id_planu: sprawdzony.id_planu, zatwierdzenie: "Zatwierdzam ten plan obliczeń." }, fn);
  const dane = wynik.pakiet_danych;
  assert.equal("raport" in wynik, false);
  assert.equal(dane.id_planu, sprawdzony.id_planu);
  assert.equal(dane.zatwierdzenie, "Zatwierdzam ten plan obliczeń.");
  assert.deepEqual(dane.tabele.map(t => t.rodzaj), ["odczytana", "przeliczona"]);
  assert.deepEqual(dane.tabele[1].wiersze, [{ suma: null }]);
  assert.deepEqual(dane.tabele[1].zrodla, ["a"]);
  assert.ok(dane.metody.length >= 2);
  assert.match(dane.ograniczenia.join(" "), /deklaracj/i);
});

test("zmieniony plan eksportu jest odrzucony przed odczytem", async () => {
  const p = plan(), s = await wykonajAnalize({ tryb: "sprawdz", plan: p }, fn);
  let calls = 0;
  await assert.rejects(() => eksportujDane({ plan: { ...p, pytanie: "Inne pytanie" }, id_planu: s.id_planu, zatwierdzenie: "Tak" }, async () => { calls++; return {}; }), /id_planu|identyfikator/i);
  assert.equal(calls, 0);
});

test("eksport niepełnych danych, błędu źródła ani pętli stron nie udaje pełnego pakietu", async () => {
  await assert.rejects(() => eksportujDane({ z }, async () => ({ wiersze, kompletne: false })), /niepełn|kompletno/i);
  await assert.rejects(() => eksportujDane({ z }, async () => ({ wiersze, kompletne: false, nastepny_kursor: "staly" })), /paginacj|kursor/i);
  await assert.rejects(() => eksportujDane({ z }, async () => ({ isError: true, content: [{ text: "Awaria testowa" }] })), /Awaria testowa/);
});

test("eksport ma limit 5000 wierszy również łącznie z tabelami przeliczonymi oraz 1 MiB", async () => {
  await assert.rejects(() => eksportujDane({ z }, async () => ({ wiersze: Array.from({ length: 5001 }, (_, id) => ({ id })), kompletne: true })), /5000/);
  await assert.rejects(() => eksportujDane({ z }, async () => ({ wiersze: [{ tekst: "ą".repeat(600000) }], kompletne: true })), /1 MiB/);
  const p = { ...plan(), operacje: [{ id: "w", typ: "wskaznik", z: "a", licznik: "n", mianownik: "d", nazwa: "wynik", jednostka: "%" }] };
  const s = await wykonajAnalize({ tryb: "sprawdz", plan: p }, async () => ({}));
  await assert.rejects(() => eksportujDane({ plan: p, id_planu: s.id_planu, zatwierdzenie: "Tak" }, async () => ({ wiersze: Array.from({ length: 2501 }, (_, id) => ({ id, n: 1, d: 2 })), kompletne: true })), /5000/);
});

test("eksport lokalnej migawki nie wymaga sieci i podaje rzeczywistą definicję ludności", async () => {
  const r = await eksportujDane({ z: { narzedzie: "ludnosc_dzielnic", argumenty: { pola: ["r_0_2"] } } }, async () => { throw Error("Nie oczekiwano sieci"); });
  assert.equal(r.pakiet_danych.tabele[0].wiersze.length, 18);
  assert.match(r.pakiet_danych.zrodla[0].definicja!, /zameldowan/i);
  assert.ok(r.pakiet_danych.zrodla[0].data_stanu);
});

test("ponowiony eksport odczytuje obecny wynik zamiast udawać poprzednią odpowiedź", async () => {
  let n = 0;
  const wywolaj = async () => ({ kompletne: true, wiersze: [{ n: ++n }] });
  const a = await eksportujDane({ z }, wywolaj), b = await eksportujDane({ z }, wywolaj);
  assert.equal(a.pakiet_danych.tabele[0].wiersze[0].n, 1);
  assert.equal(b.pakiet_danych.tabele[0].wiersze[0].n, 2);
  assert.equal(a.pakiet_danych.odczyt, "ponowiony");
});

test("ZIP danych zawiera JSON, pochodzenie i wszystkie CSV bez raportu; zachowuje wartości i bezpieczne nazwy", async () => {
  const r = await eksportujDane({ z, tytul: "Łódź / dane" }, fn), p = r.pakiet_danych;
  p.tabele[0].id = "../usługi";
  p.tabele[0].wiersze[0].n = "=SUM(A1)";
  p.tabele.push({ ...p.tabele[0], id: "uslugi" });
  const pliki = unzipSync(pakietDanychZIP(p));
  assert.deepEqual(Object.keys(pliki).sort(), ["README.txt", "dane.json", "pochodzenie.json", "tabele/001-uslugi.csv", "tabele/002-uslugi.csv"]);
  assert.deepEqual(wczytajPakietDanych(strFromU8(pliki["dane.json"])), p);
  const pochodzenie = JSON.parse(strFromU8(pliki["pochodzenie.json"]));
  assert.deepEqual(pochodzenie.zrodla, p.zrodla);
  assert.deepEqual(pochodzenie.metody, p.metody);
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(pliki["tabele/001-uslugi.csv"]), tabelaCSV(p.tabele[0]));
  assert.deepEqual([...pliki["tabele/001-uslugi.csv"].slice(0, 3)], [239, 187, 191]);
  assert.match(strFromU8(pliki["README.txt"]), /ponown|ponowion/i);
  assert.match(strFromU8(pliki["README.txt"]), /pobrania.*datą stanu/i);
  assert.doesNotMatch(nazwaPakietuDanych(p), /[/\\]/);
  assert.match(nazwaPakietuDanych(p), /\.zip$/);
});

test("parser pakietu odrzuca nieznane źródła, powtórzenia, niepełność, niepoprawne liczby i nadmierną strukturę", async () => {
  const bazowy = (await eksportujDane({ z }, fn)).pakiet_danych;
  const mutacje: ((p: any) => void)[] = [
    p => { p.wersja = "2"; }, p => { p.tabele[0].zrodla = ["brak"]; },
    p => { p.zrodla.push(p.zrodla[0]); }, p => { p.tabele.push(p.tabele[0]); },
    p => { p.tabele[0].kompletne = false; }, p => { p.zrodla[0].kompletne = false; },
    p => { p.tabele[0].wiersze = [[1]]; }, p => { p.odczyt = "ten_sam"; },
    p => { p.zatwierdzenie = "Wymyślona zgoda"; }, p => { p.utworzono = "wczoraj"; },
  ];
  for (const zmien of mutacje) {
    const p = structuredClone(bazowy); zmien(p);
    assert.throws(() => wczytajPakietDanych(JSON.stringify(p)), /pakiet|danych/i);
  }
  assert.throws(() => wczytajPakietDanych('{"__proto__":{"x":1}}'), /klucz/);
  assert.throws(() => wczytajPakietDanych(JSON.stringify(bazowy).replace('"n":4', '"n":1e999')), /liczba/i);
  const duzy = structuredClone(bazowy); duzy.tabele[0].wiersze = Array.from({ length: 5001 }, () => ({ n: 1 }));
  assert.throws(() => pakietDanychZIP(duzy), /5000/);
});
