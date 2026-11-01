import { test } from "node:test";
import assert from "node:assert/strict";
import { analizaSchema, wykonajAnalize } from "../src/raport.ts";
import type { RaportAnalityczny } from "../shared/raport.ts";

const zrodlo = (id = "a", extra: Record<string, unknown> = {}) => ({ id, narzedzie: "dane_zapytaj", argumenty: { id: `msip:${id}` }, data_stanu: "2026-01-01", poziom: "dzielnica", jednostka: "osób", ...extra });
const plan = (operacje: unknown[] = [], zrodla: unknown[] = [zrodlo()]) => ({ tytul: "Kontrolowana analiza", pytanie: "Jaka jest wartość?", zrodla, operacje });
const atrapa = (rows: Record<string, unknown>[] = [{ id: 1, n: 4, d: 2 }, { id: 2, n: null, d: 0 }]) => async (name: string) => name === "zbior_opis" ? { pola: ["id:Integer", "n:Double", "d:Double"], zrodlo: "msip" } : { wiersze: rows, kompletne: true, zrodlo: "Kontrolowane dane" };
async function wykonaj(p: unknown, fn: (name: string, args: unknown) => Promise<any> = atrapa()) {
  const checked = await wykonajAnalize({ tryb: "sprawdz", plan: p }, fn);
  return wykonajAnalize({ tryb: "wykonaj", plan: p, id_planu: checked.id_planu, zatwierdzenie: "Zatwierdzam przedstawiony plan." }, fn);
}
const raport = (r: Record<string, unknown>) => r.raport as RaportAnalityczny;

test("plan jest deklaratywny: allowlista, limity, unikalne id i kolejność zależności", () => {
  assert.equal(analizaSchema.safeParse({ tryb: "sprawdz", plan: plan() }).success, true);
  for (const p of [plan([], [zrodlo("a", { narzedzie: "analiza" })]), plan([], Array.from({ length: 9 }, (_, i) => zrodlo(String(i)))), plan([], [zrodlo(), zrodlo()]), plan([{ id: "b", typ: "wskaznik", z: "brak", licznik: "n", mianownik: "d", nazwa: "w", jednostka: "%" }]), { ...plan(), kod: "return 1" }]) {
    assert.equal(analizaSchema.safeParse({ tryb: "sprawdz", plan: p }).success, false);
  }
});

test("sprawdzenie nie pobiera tabel, hash jest stabilny dla kolejności kluczy", async () => {
  const calls: string[] = [];
  const fn = async (n: string) => { calls.push(n); assert.equal(n, "zbior_opis"); return { pola: ["id:Integer"] }; };
  const p = plan();
  const r = await wykonajAnalize({ tryb: "sprawdz", plan: p }, fn);
  const r2 = await wykonajAnalize({ plan: { operacje: [], zrodla: p.zrodla, pytanie: p.pytanie, tytul: p.tytul }, tryb: "sprawdz" }, fn);
  assert.match(String(r.id_planu), /^[a-f0-9]{64}$/);
  assert.equal(r.id_planu, r2.id_planu);
  assert.equal(calls.length, 2);
  assert.match(JSON.stringify(r), /deklaracj/i);
});

test("wykonanie wymaga zatwierdzenia dokładnie tego planu", async () => {
  await assert.rejects(() => wykonajAnalize({ tryb: "wykonaj", plan: plan() }, atrapa()), /zatwierdzeni|id_planu/i);
  const r = await wykonajAnalize({ tryb: "sprawdz", plan: plan() }, atrapa());
  await assert.rejects(() => wykonajAnalize({ tryb: "wykonaj", plan: { ...plan(), pytanie: "Inne pytanie" }, id_planu: r.id_planu, zatwierdzenie: "Tak" }, atrapa()), /identyfikator|id_planu/i);
});

test("left join zachowuje braki jako null, jawne klucze i pochodzenie", async () => {
  const p = plan([{ id: "j", typ: "polacz", lewe: "a", prawe: "b", klucz_lewy: "id", klucz_prawy: "id" }], [zrodlo(), zrodlo("b")]);
  const fn = async (name: string, args?: unknown) => name === "zbior_opis" ? {} : { kompletne: true, wiersze: (args as any).id === "msip:a" ? [{ id: 1, n: 3 }, { id: 2, n: 4 }] : [{ id: 1, d: 8 }] };
  const r = raport(await wykonaj(p, fn));
  assert.deepEqual(r.tabele.at(-1)?.wiersze, [{ id: 1, n: 3, p_id: 1, p_d: 8 }, { id: 2, n: 4, p_id: null, p_d: null }]);
  assert.deepEqual(r.tabele.at(-1)?.zrodla, ["a", "b"]);
  assert.match(r.ograniczenia.join(" "), /dopasowania.*1|1.*dopasowania/);
});

test("join blokuje duplikaty, kolizję nazw i niezgodny typ klucza", async () => {
  const p = plan([{ id: "j", typ: "polacz", lewe: "a", prawe: "b", klucz_lewy: "id", klucz_prawy: "id" }], [zrodlo(), zrodlo("b")]);
  await assert.rejects(() => wykonaj(p, atrapa([{ id: 1 }, { id: 1 }])), /duplikat|kardynalno/i);
  const fn = async (n: string, a?: unknown) => n === "zbior_opis" ? {} : { kompletne: true, wiersze: (a as any).id === "msip:a" ? [{ id: 1, p_id: 3 }] : [{ id: 1 }] };
  await assert.rejects(() => wykonaj(p, fn), /kolizj/i);
  const types = async (n: string, a?: unknown) => n === "zbior_opis" ? {} : { kompletne: true, wiersze: [{ id: (a as any).id === "msip:a" ? 1 : "1" }] };
  await assert.rejects(() => wykonaj(p, types), /typ.*klucz|klucz.*typ/i);
});

test("porównywalność dat i poziomów wymaga jawnego uzasadnienia różnic", async () => {
  const op = { id: "j", typ: "polacz", lewe: "a", prawe: "b", klucz_lewy: "id", klucz_prawy: "id" };
  for (const extra of [{ data_stanu: "2024-01-01" }, { poziom: "miasto" }]) {
    await assert.rejects(() => wykonaj(plan([op], [zrodlo(), zrodlo("b", extra)])), /porównywal|dat.*stanu|poziom/i);
  }
  const r = raport(await wykonaj(plan([{ ...op, uzasadnienie_roznic: "Porównanie stanów z różnych dat ma charakter orientacyjny." }], [zrodlo(), zrodlo("b", { data_stanu: "2024-01-01" })])));
  assert.match(r.ograniczenia.join(" "), /orientacyjny/);
});

test("wskaźnik nie zamienia null i zerowego mianownika na zero", async () => {
  const p = plan([{ id: "w", typ: "wskaznik", z: "a", licznik: "n", mianownik: "d", nazwa: "na_100", mnoznik: 100, jednostka: "%" }]);
  const r = raport(await wykonaj(p, atrapa([{ id: 1, n: 0, d: 2 }, { id: 2, n: null, d: 2 }, { id: 3, n: 2, d: 0 }])));
  assert.deepEqual(r.tabele.at(-1)?.wiersze.map((w) => w.na_100), [0, null, null]);
});

test("agregacja zachowuje nieznane sumy oraz liczy tylko wartości znane", async () => {
  const p = plan([{ id: "sumy", typ: "agreguj", z: "a", grupuj_po: ["id"], miary: [{ pole: "n", fn: "sum", nazwa: "suma" }, { pole: "n", fn: "count", nazwa: "znane" }] }]);
  const r = raport(await wykonaj(p, atrapa([{ id: 1, n: 2 }, { id: 1, n: null }, { id: 2, n: null }])));
  assert.deepEqual(r.tabele.at(-1)?.wiersze, [{ id: 1, suma: null, znane: 1 }, { id: 2, suma: null, znane: 0 }]);
});

test("pełna paginacja kursorem i deduplikacja identycznych zapytań", async () => {
  const calls: unknown[] = [];
  const fn = async (n: string, a?: unknown) => {
    if (n === "zbior_opis") return {};
    calls.push(a);
    return (a as any).kursor ? { wiersze: [{ id: 2 }], kompletne: true } : { wiersze: [{ id: 1 }], kompletne: false, nastepny_kursor: "dalej" };
  };
  const r = raport(await wykonaj(plan([], [zrodlo(), zrodlo("b", { argumenty: { id: "msip:a" } })]), fn));
  assert.equal(calls.length, 2);
  assert.equal(r.tabele[0].wiersze.length, 2);
  assert.equal(r.zrodla.every((s) => s.kompletne), true);
});

test("paginacja MSIP offsetem i pliku według liczby wierszy", async () => {
  const calls: any[] = [];
  const fn = async (n: string, a?: unknown) => {
    if (n === "zbior_opis") return {};
    calls.push(a);
    return { wiersze: [{ id: (a as any).offset ? 2 : 1 }], ...(n === "plik_odczyt" ? { wierszy_w_wyniku: 2 } : { kompletne: !!(a as any).offset, uwagi: (a as any).offset ? [] : ["Są kolejne wiersze: ponów z offset=1."] }) };
  };
  const r = raport(await wykonaj(plan([], [zrodlo(), zrodlo("plik", { narzedzie: "plik_odczyt", argumenty: { url: "https://dane.krakow.pl/dane.csv" } })]), fn));
  assert.equal(calls.length, 4);
  assert.equal(r.zrodla.every((s) => s.kompletne), true);
});

test("niepełne źródło, pętla kursora i błąd źródła zatrzymują obliczenia", async () => {
  await assert.rejects(() => wykonaj(plan(), async (n) => n === "zbior_opis" ? {} : { wiersze: [{ id: 1 }], kompletne: false }), /niepełn|kompletno/i);
  await assert.rejects(() => wykonaj(plan(), async (n) => n === "zbior_opis" ? {} : { wiersze: [{ id: 1 }], kompletne: false, nastepny_kursor: "stale" }), /paginacj|kursor/i);
  await assert.rejects(() => wykonaj(plan(), async (n) => n === "zbior_opis" ? {} : { isError: true, content: [{ text: "Awaria źródła" }] }), /Awaria źródła/);
});

test("limity wierszy i bajtów zgłaszają błąd zamiast ucinać", async () => {
  await assert.rejects(() => wykonaj(plan(), atrapa(Array.from({ length: 5001 }, (_, id) => ({ id })))), /5000/);
  await assert.rejects(() => wykonaj(plan(), atrapa([{ id: 1, tekst: "ą".repeat(600000) }])), /1 MiB|1048576/);
});

test("statystyka i projekcja używają źródeł i zachowują metody oraz ograniczenia", async () => {
  const p = plan([{ id: "opis", typ: "statystyka", z: "a", operacja: "opis", x: "n" }, { id: "prog", typ: "projekcja", z: "a", x: "rok", y: "n", horyzont: 1, metoda: "liniowy" }]);
  const r = await wykonaj(p, atrapa([{ rok: 2020, n: 1 }, { rok: 2022, n: 3 }, { rok: 2024, n: 5 }]));
  assert.equal(raport(r).tabele.find((t) => t.id === "prog")?.wiersze[0].wartosc, 7);
  assert.equal(raport(r).wnioski.length, 0);
  assert.match(raport(r).ograniczenia.join(" "), /Projekcja|Krótka seria/);
  assert.ok((r.bloki as unknown[]).length <= 8);
});

test("lokalna ludność korzysta z zaufanej migawki, nie z liczb modelu", async () => {
  const p = plan([], [{ id: "lud", narzedzie: "ludnosc_dzielnic", argumenty: { pola: ["r_0_2", "r_3_6"] } }]);
  const r = raport(await wykonaj(p, async () => { throw new Error("Nie oczekiwano sieci"); }));
  assert.equal(r.tabele[0].wiersze.length, 18);
  assert.equal(r.zrodla[0].poziom, "dzielnica");
  assert.match(r.zrodla[0].definicja!, /zameldowan/i);
  assert.ok(r.zrodla[0].data_stanu);
  assert.match(r.zrodla[0].url!, /Demografia\/Elud_Dz/);
});

test("normalizacja dzielnic: pełne nazwy, konflikty oraz jawna geometria", async () => {
  const s = zrodlo("a", { dzielnica_pole: "dzielnica", dzielnica_z_geometrii: true });
  const calls: any[] = [];
  const fn = async (n: string, a: unknown) => {
    if (n === "zbior_opis") return {};
    calls.push(a);
    return { kompletne: true, wiersze: [{ dzielnica: "XV Bieńczyce", _geometria: { lat: 50.0617, lon: 19.9373 } }, { dzielnica: "I Stare Miasto", _geometria: { srodek: { lat: 50.0617, lon: 19.9373 } } }, { dzielnica: "IV Prądnik Czerwony" }] };
  };
  const r = raport(await wykonaj(plan([], [s]), fn));
  assert.deepEqual(r.tabele[0].wiersze.map((w) => w.dzielnica_id), [1, 1, null]);
  assert.equal(calls[0].zwroc_geometrie, true);
  assert.equal(calls[0].limit, 50);
  assert.match(r.ograniczenia.join(" "), /Konflikty opisu z geometrią: 2/);
  assert.equal(r.tabele[0].kolumny.includes("_geometria"), false);
});

test("plan odrzuca wykonywalny kod, nieprawidłowe argumenty i obce adresy", () => {
  for (const a of [{ id: "msip:a", kod: "return 1" }, { id: "msip:a", filtr: "1=1;DROP TABLE dane" }, { id: "msip:a", limit: 9000 }, { id: "msip:a", geometria: { z: { id: "msip:b", where: "select * from dane" } } }]) {
    assert.equal(analizaSchema.safeParse({ tryb: "sprawdz", plan: plan([], [zrodlo("a", { argumenty: a })]) }).success, false);
  }
  assert.equal(analizaSchema.safeParse({ tryb: "sprawdz", plan: plan([], [zrodlo("a", { narzedzie: "plik_odczyt", argumenty: { url: "https://example.com/x.csv" } })]) }).success, false);
});

test("metadane i jednostki niezgodne z planem zatrzymują analizę", async () => {
  await assert.rejects(() => wykonajAnalize({ tryb: "sprawdz", plan: plan([], [zrodlo("a", { argumenty: { id: "msip:a", pola: ["nieistniejaca"] } })]) }, atrapa()), /metadane/);
  await assert.rejects(() => wykonaj(plan(), async (n) => n === "zbior_opis" ? {} : { kompletne: true, jednostka: "ha", wiersze: [{ id: 1, n: 1 }] }), /jednostka.*różni/);
});

test("paginacja nie maskuje przycięcia przez źródło", async () => {
  const fn = async (n: string) => n === "zbior_opis" ? {} : { kompletne: false, nastepny_kursor: "dalej", wiersze: [{ id: 1 }], uwagi: ["Odpowiedź przycięta do 1 wierszy ze względu na rozmiar"] };
  await assert.rejects(() => wykonaj(plan(), fn), /przycięło.*kompletności/);
});

test("statystyka trendu używa rzeczywistego czasu także po brakującej obserwacji", async () => {
  const p = plan([{ id: "trend", typ: "statystyka", z: "a", operacja: "trend", x: "n", czas: "rok", etykieta: "rok" }]);
  const r = raport(await wykonaj(p, atrapa([{ rok: 2000, n: 2 }, { rok: 2001, n: null }, { rok: 2003, n: 8 }, { rok: 2005, n: 12 }, { rok: 2006, n: 14 }])));
  assert.equal((r.tabele.at(-1)!.wiersze[0].wartosc as any).nachylenie_sena, 2);
});

test("pusta tabela nie staje się dowodem braku zjawiska", async () => {
  const r = raport(await wykonaj(plan(), atrapa([])));
  assert.equal(r.tabele[0].wiersze.length, 0);
  assert.deepEqual(r.wnioski, []);
});

test("BDL pobiera każdą zmienną bez utraty stron i ponownie używa identycznych odczytów", async () => {
  const calls: any[] = [];
  const fn = async (n: string, a: unknown) => {
    calls.push(a);
    assert.equal(n, "bdl_dane");
    assert.equal((a as any).zmienne.length, 1);
    return { jednostka_id: "011212161000", wiersze: [{ zmienna_id: (a as any).zmienne[0], rok: 2025, wartosc: 2, jednostka_miary: "osób" }] };
  };
  const p = plan([], [zrodlo("a", { narzedzie: "bdl_dane", argumenty: { zmienne: [1, 2], jednostka: "powiat" } }), zrodlo("b", { narzedzie: "bdl_dane", argumenty: { zmienne: [1], jednostka: "powiat" } })]);
  const r = raport(await wykonaj(p, fn));
  assert.equal(calls.length, 2);
  assert.equal(r.tabele[0].wiersze.length, 2);
  assert.match(r.zrodla[0].url!, /api\/v1\/data\/by-unit\/011212161000/);
});

test("identyczna projekcja dwóch stron nie oznacza pętli paginacji", async () => {
  const calls: any[] = [];
  const fn = async (n: string, a: unknown) => {
    if (n === "zbior_opis") return {};
    calls.push(a);
    const ostatnia = (a as any).offset === 50;
    return { wiersze: Array.from({ length: 50 }, () => ({ typ: "Przedszkole" })), kompletne: ostatnia, uwagi: ostatnia ? [] : ["Są kolejne wiersze: ponów z offset=50."] };
  };
  const r = raport(await wykonaj(plan([], [zrodlo("a", { argumenty: { id: "msip:a", pola: ["typ"] } })]), fn));
  assert.equal(calls.length, 2);
  assert.equal(r.tabele[0].wiersze.length, 100);
  assert.equal(r.zrodla[0].kompletne, true);
});

test("paginacja odrzuca powtórzenia rzeczywistego identyfikatora obiektu", async () => {
  const fn = async (n: string, a: unknown) => n === "zbior_opis" ? {} : {
    objectIdFieldName: "OBJECTID", wiersze: [{ OBJECTID: 123, typ: "Przedszkole" }],
    kompletne: !!(a as any).offset, uwagi: (a as any).offset ? [] : ["Są kolejne wiersze: ponów z offset=1."],
  };
  await assert.rejects(() => wykonaj(plan(), fn), /identyfikator.*obiektu|obiektu.*identyfikator/i);
});

test("raport deklaruje dokładną miarę wskaźnika, zamiast zgadywać kolumny liczbowe", async () => {
  const p = plan([{ id: "w", typ: "wskaznik", z: "a", licznik: "n", mianownik: "d", nazwa: "miejsca_na_dziecko", mnoznik: 100, jednostka: "miejsc na 100 dzieci" }]);
  const r = raport(await wykonaj(p, atrapa([{ id: 12, nazwa: "Dzielnica A", n: 10, d: 20, obca_miara: 999 }, { id: 4, nazwa: "Dzielnica B", n: 20, d: 10, obca_miara: 888 }])));
  assert.deepEqual((r as any).wykresy, [{ tabela: "w", tytul: "w", rodzaj: "slupki", kolumna_x: "nazwa", kolumny_y: ["miejsca_na_dziecko"], jednostka: "miejsc na 100 dzieci" }]);
  const bezNazwy = raport(await wykonaj(p));
  assert.equal((bezNazwy as any).wykresy[0].kolumna_x, "id");
  const bezEtykiety = raport(await wykonaj(p, atrapa([{ n: 10, d: 20 }, { n: 20, d: 10 }])));
  assert.deepEqual((bezEtykiety as any).wykresy, []);
});

test("raport projekcji deklaruje oś x i prognozowaną wartość, statystyka nie zgaduje wykresu", async () => {
  const p = plan([{ id: "opis", typ: "statystyka", z: "a", operacja: "opis", x: "n" }, { id: "prog", typ: "projekcja", z: "a", x: "rok", y: "n", horyzont: 1, metoda: "liniowy" }]);
  const r = raport(await wykonaj(p, atrapa([{ rok: 2020, n: 1 }, { rok: 2022, n: 3 }, { rok: 2024, n: 5 }])));
  assert.deepEqual((r as any).wykresy, [{ tabela: "prog", tytul: "prog: projekcja", rodzaj: "linia", kolumna_x: "x", kolumny_y: ["wartosc"], jednostka: "osób" }]);
});
