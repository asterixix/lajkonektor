// Testy prognozy (matematyka offline) i odczytu plików (parsery offline + prawdziwe pliki z dane.gov.pl i MSIP).
import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { prognoza } from "../src/prognoza.ts";
import { obrobka, plikOdczyt, sprawdzUrl, wTabele, wykryjFormat } from "../src/plik.ts";
import { naZywo } from "./na-zywo.ts";

const seria = (f: (x: number) => number, od: number, n: number) => Array.from({ length: n }, (_, i) => ({ x: od + i, y: f(od + i) }));
const bajty = (s: string) => new TextEncoder().encode(s);

// --- prognoza
test("prognoza: idealny trend liniowy daje dokładną ekstrapolację i wąski przedział", () => {
  const r = prognoza({ serie: seria((x) => 10 + 2 * x, 2018, 8), horyzont: 3 });
  assert.equal(r.metoda, "liniowy");
  assert.equal(r.prognoza[0].x, 2026);
  assert.ok(Math.abs(r.prognoza[0].wartosc - (10 + 2 * 2026)) < 1e-6);
  assert.ok(r.prognoza[2].gorna_95 - r.prognoza[2].dolna_95 < 1e-6, "brak szumu = brak niepewności");
  assert.equal(r.jakosc.r2, 1);
});

test("prognoza: przedział rośnie z horyzontem i 80% jest węższy niż 95%", () => {
  const dane = seria((x) => 100 + 3 * x + (x % 2 ? 4 : -4), 2010, 12); // szum +-4
  const r = prognoza({ serie: dane, horyzont: 5, metoda: "liniowy" });
  const sz = (p: (typeof r.prognoza)[number], k: 80 | 95) => (k === 80 ? p.gorna_80 - p.dolna_80 : p.gorna_95 - p.dolna_95);
  assert.ok(sz(r.prognoza[4], 95) > sz(r.prognoza[0], 95));
  assert.ok(sz(r.prognoza[0], 80) < sz(r.prognoza[0], 95));
  assert.ok(r.prognoza.every((p) => p.dolna_95 < p.wartosc && p.wartosc < p.gorna_95));
});

test("prognoza: wzrost wykładniczy rozpoznany w trybie auto, wynik dodatni", () => {
  const r = prognoza({ serie: seria((x) => 100 * 1.1 ** (x - 2015), 2015, 9), horyzont: 2 });
  assert.equal(r.metoda, "wykladniczy");
  assert.ok(Math.abs(r.prognoza[0].wartosc - 100 * 1.1 ** 9) / (100 * 1.1 ** 9) < 1e-6);
  assert.equal((r.parametry as any).wzrost_na_krok_proc, 10);
  assert.ok(r.prognoza.every((p) => p.dolna_95 > 0));
});

test("prognoza: deterministyczna (dwa wywołania identyczne) i porównuje metody", () => {
  const dane = seria((x) => 50 + 2 * x + Math.sin(x) * 3, 2012, 12);
  const a = prognoza({ serie: dane, horyzont: 4 }), b = prognoza({ serie: dane, horyzont: 4 });
  assert.deepEqual(a, b);
  assert.ok(a.porownanie_metod.length >= 2);
  assert.ok(a.opis_metody.length > 20 && a.uwaga.includes("nie przewidywanie"));
});

test("prognoza: metoda Holta nadąża za zmianą nachylenia lepiej niż prosta", () => {
  const dane = [...seria((x) => x * 1, 0, 8), ...seria((x) => 7 + (x - 7) * 5, 8, 6)]; // przyspieszenie po x=8
  const h = prognoza({ serie: dane, horyzont: 1, metoda: "holt" }), l = prognoza({ serie: dane, horyzont: 1, metoda: "liniowy" });
  const prawda = 7 + (14 - 7) * 5;
  assert.ok(Math.abs(h.prognoza[0].wartosc - prawda) < Math.abs(l.prognoza[0].wartosc - prawda));
});

test("prognoza: krótkie serie i błędne dane są jawnie obsłużone", () => {
  assert.throws(() => prognoza({ serie: seria((x) => x, 1, 2), horyzont: 2 }), /co najmniej 3/);
  assert.throws(() => prognoza({ serie: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }], horyzont: 1 }), /powtórzone/);
  assert.throws(() => prognoza({ serie: [{ x: 1, y: 1 }, { x: 2, y: NaN }, { x: 3, y: 3 }], horyzont: 1 }), /nieliczbowe/);
  const krotka = prognoza({ serie: [{ x: 2023, y: 15000 }, { x: 2024, y: 15800 }, { x: 2025, y: 16500 }], horyzont: 3 });
  assert.ok(krotka.ostrzezenia?.some((o) => o.includes("Krótka seria")));
  assert.equal(krotka.metoda, "liniowy");
  assert.ok(krotka.prognoza[0].gorna_95 - krotka.prognoza[0].dolna_95 > 1000, "n=3: przedział bardzo szeroki (t df=1)");
  assert.throws(() => prognoza({ serie: seria((x) => -x, 1, 6), horyzont: 1, metoda: "wykladniczy" }), /niedostępna/);
});

test("prognoza: ostatnie_punkty ucina historię, a ostrzeżenie wskazuje rozbieżność kierunku", () => {
  // spadek do x=2019, potem wzrost: pełna seria (wykładnicza/liniowa) idzie w dół, ogon rośnie
  const dane = [{ x: 2015, y: 10 }, { x: 2016, y: 8 }, { x: 2017, y: 6.5 }, { x: 2018, y: 5 }, { x: 2019, y: 3 }, { x: 2020, y: 3.5 }, { x: 2021, y: 4.2 }, { x: 2022, y: 5 }, { x: 2023, y: 5.8 }];
  const pelna = prognoza({ serie: dane, horyzont: 2, metoda: "liniowy" });
  assert.ok(pelna.ostrzezenia?.some((o) => o.includes("przeciwnym kierunku")), JSON.stringify(pelna.ostrzezenia));
  const ogon = prognoza({ serie: dane, horyzont: 2, metoda: "liniowy", ostatnie_punkty: 5 });
  assert.equal(ogon.jakosc.punktow, 5);
  assert.equal(ogon.jakosc.punktow_w_serii, 9);
  assert.ok(ogon.prognoza[0].wartosc > dane[dane.length - 1].y, "po ucięciu prognoza rośnie wraz z ogonem");
  assert.ok(!ogon.ostrzezenia?.some((o) => o.includes("przeciwnym kierunku")));
});

// --- bezpieczeństwo URL
test("sprawdzUrl: tylko https i instytucje publiczne, bez IP i lokalnych hostów", () => {
  assert.doesNotThrow(() => sprawdzUrl(new URL("https://api.dane.gov.pl/resources/1/file"), true));
  assert.doesNotThrow(() => sprawdzUrl(new URL("https://msip3.um.krakow.pl/x"), true));
  for (const zly of ["http://api.dane.gov.pl/x", "https://example.com/x", "https://127.0.0.1/x", "https://localhost/x", "https://api.dane.gov.pl:8443/x", "https://evilgov.pl/x", "https://x.gov.pl.evil.com/x", "https://user:pw@api.dane.gov.pl/x"])
    assert.throws(() => sprawdzUrl(new URL(zly), true), () => true, zly);
  assert.doesNotThrow(() => sprawdzUrl(new URL("https://api.rednet24.pl/x"), false), "przekierowanie z dozwolonego hosta");
  assert.throws(() => sprawdzUrl(new URL("https://10.0.0.5/x"), false), /IP/);
});

// --- parsery offline
test("CSV: średnik, cudzysłowy z nową linią i przecinkiem dziesiętnym, liczby i puste", () => {
  const csv = '"Nazwa";"Cena";"Uwagi"\n"Dom A";1 250,50;"linia 1\nlinia 2"\n"Dom ""B""";980;\n';
  const t = wTabele(bajty(csv), "csv", {});
  assert.deepEqual(t.kolumny, ["Nazwa", "Cena", "Uwagi"]);
  assert.equal(t.wiersze.length, 2);
  assert.equal(t.wiersze[0][1], 1250.5);
  assert.equal(t.wiersze[0][2], "linia 1\nlinia 2");
  assert.equal(t.wiersze[1][0], 'Dom "B"');
  assert.equal(t.wiersze[1][2], null);
});

test("CSV: kodowanie windows-1250 i separator tabulacji", () => {
  // "Łódź\tzł" w cp1250: Ł=0xA3 ó=0xF3 d z ź=0x9F
  const b = new Uint8Array([0x4e, 0x61, 0x7a, 0x77, 0x61, 0x09, 0x57, 0x0a, 0xa3, 0xf3, 0x64, 0x9f, 0x09, 0x31, 0x32, 0x0a]);
  const t = wTabele(b, "csv", {});
  assert.deepEqual(t.kolumny, ["Nazwa", "W"]);
  assert.equal(t.wiersze[0][0], "Łódź");
  assert.equal(t.wiersze[0][1], 12);
  assert.match(t.uwagi[0], /windows-1250/);
});

function xlsx(): Uint8Array {
  return zipSync({
    "xl/workbook.xml": strToU8('<workbook xmlns:r="x"><sheets><sheet name="Dane" sheetId="1" r:id="rId1"/><sheet name="Drugi" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8('<sst><si><t>Dzielnica</t></si><si><t>Liczba</t></si><si><t>Data</t></si><si><t>Stare &amp; Nowe</t></si><si><r><t>Pod</t></r><r><t>górze</t></r></si></sst>'),
    "xl/styles.xml": strToU8('<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>'),
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>12.5</v></c><c r="C2" t="inlineStr"><is><t>wstawiony</t></is></c><c r="D2" s="1"><v>46023</v></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3"><v>7</v></c></row>' +
      '</sheetData></worksheet>'),
    "xl/worksheets/sheet2.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>X</t></is></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData></worksheet>'),
  });
}

test("XLSX: arkusze, współdzielone i wstawione napisy, encje, rozbite runy, puste kolumny, data z formatu", () => {
  const t = wTabele(xlsx(), "xlsx", {});
  assert.deepEqual(t.arkusze, ["Dane", "Drugi"]);
  assert.deepEqual(t.kolumny, ["Dzielnica", "Liczba", "kolumna_3", "Data"]);
  assert.equal(t.wiersze[0][0], "Stare & Nowe");
  assert.equal(t.wiersze[0][1], 12.5);
  assert.equal(t.wiersze[0][2], "wstawiony");
  assert.equal(t.wiersze[0][3], "2026-01-01", "serial 46023 = 2026-01-01");
  assert.equal(t.wiersze[1][0], "Podgórze", "tekst z kilku runów");
  assert.equal(t.wiersze[1][3], null);
  const d = wTabele(xlsx(), "xlsx", { arkusz: "drugi" });
  assert.deepEqual(d.kolumny, ["X"]);
  assert.equal(d.wiersze[0][0], 1);
  assert.throws(() => wTabele(xlsx(), "xlsx", { arkusz: "brak" }), /Nie ma arkusza/);
});

test("GeoJSON: środek, ramka, pole wielokąta, punkty, współrzędne poza WGS84", () => {
  const kw = 0.001; // ok. 70 x 111 m
  const geo = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { nazwa: "kwadrat", n: 3 }, geometry: { type: "Polygon", coordinates: [[[19.9, 50.0], [19.9 + kw, 50.0], [19.9 + kw, 50.0 + kw], [19.9, 50.0 + kw], [19.9, 50.0]]] } },
      { type: "Feature", properties: { nazwa: "punkt", n: 5 }, geometry: { type: "Point", coordinates: [19.95, 50.05] } },
    ],
  };
  const t = wTabele(bajty(JSON.stringify(geo)), "geojson", {});
  const i = (k: string) => t.kolumny.indexOf(k);
  assert.ok(Math.abs((t.wiersze[0][i("_srodek_lat")] as number) - 50.0005) < 1e-4);
  const pole = t.wiersze[0][i("_powierzchnia_ha")] as number;
  assert.ok(pole > 0.7 && pole < 0.9, `pole ${pole} ha (oczekiwane ~0,78)`);
  assert.equal(t.wiersze[1][i("_geometria")], "Point");
  assert.equal(t.wiersze[1][i("_powierzchnia_ha")], null);
  const ep = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [570000, 240000] } }] };
  assert.match(wTabele(bajty(JSON.stringify(ep)), "geojson", {}).uwagi.join(" "), /poza zakresem WGS84/);
  assert.equal(wTabele(bajty(JSON.stringify(geo)), "geojson", { geometria: "brak" }).kolumny.length, 2);
});

test("wykryjFormat i obróbka: sortowanie, agregacja i walidacja nazw kolumn", () => {
  assert.equal(wykryjFormat(new Uint8Array([0x50, 0x4b, 3, 4]), "", "https://x.gov.pl/a"), "xlsx");
  assert.equal(wykryjFormat(bajty('{"type":"FeatureCollection"}'), "application/json", "https://x.gov.pl/a"), "geojson");
  assert.equal(wykryjFormat(bajty("a;b\n1;2"), "text/csv", "https://x.gov.pl/a.csv"), "csv");
  const t = wTabele(bajty("dz;ile\nA;1\nA;4\nB;10\n"), "csv", {});
  const o = obrobka(t, { grupuj_po: ["dz"], agreguj: [{ fn: "sum", pole: "ile", nazwa: "suma" }], sortuj: "suma desc" });
  assert.deepEqual(o.wiersze, [{ dz: "B", suma: 10 }, { dz: "A", suma: 5 }]);
  assert.throws(() => obrobka(t, { pola: ["nie_ma"] }), /Nieznane kolumny/);
  assert.equal(obrobka(t, { limit: 2, offset: 1 }).wiersze.length, 2);
});

// --- prawdziwe pliki (wymagają internetu)
const CSV = "https://api.dane.gov.pl/resources/2826441,ceny-ofertowe-mieszkan-dewelopera-novy-mateczny-krakow-2026-10-19/file";
const XLSX = "https://api.dane.gov.pl/resources/2826170,ceny-ofertowe-mieszkan-dewelopera-dom-development-krakow-sp-z-oo-2026-10-18/file";

naZywo("na żywo: CSV z dane.gov.pl (przekierowanie do serwera dostawcy), profil kolumn", { timeout: 60_000 }, async () => {
  const r = await plikOdczyt({ url: CSV, limit: 3 });
  assert.equal(r.format, "csv");
  assert.ok(r.wierszy_w_pliku > 0 && r.kolumny.length > 10);
  assert.ok(r.kolumny_profil.some((k: any) => k.typ === "liczba"), "powinna być kolumna liczbowa");
  assert.ok(r.wiersze.length <= 3);
});

naZywo("na żywo: XLSX z dane.gov.pl, agregacja po stronie serwera", { timeout: 60_000 }, async () => {
  const r = await plikOdczyt({ url: XLSX, limit: 2 });
  assert.equal(r.format, "xlsx");
  assert.ok(r.arkusze && r.wierszy_w_pliku > 50);
  const liczbowa = (r.kolumny_profil as any[]).find((k) => k.typ === "liczba" && k.min !== k.max);
  assert.ok(liczbowa, "kolumna liczbowa w arkuszu");
  const s = await plikOdczyt({ url: XLSX, agreguj: [{ fn: "count", pole: liczbowa.nazwa, nazwa: "n" }, { fn: "sum", pole: liczbowa.nazwa, nazwa: "suma" }] });
  assert.equal(s.wiersze[0].n <= r.wierszy_w_pliku, true);
  assert.ok(Math.abs(s.wiersze[0].suma - liczbowa.suma) < 1e-3 * Math.abs(liczbowa.suma) + 1, "suma serwera zgodna z profilem");
});

naZywo("na żywo: GeoJSON z MSIP (dzielnice Krakowa), pola wielokątów", { timeout: 60_000 }, async () => {
  const url = "https://msip3.um.krakow.pl/server/rest/services/Pobieranie/Dzielnice/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";
  const r = await plikOdczyt({ url, limit: 30 });
  assert.equal(r.format, "geojson");
  assert.equal(r.wierszy_w_pliku, 18, "Kraków ma 18 dzielnic");
  const pole = (r.kolumny_profil as any[]).find((k) => k.nazwa === "_powierzchnia_ha");
  assert.ok(pole && pole.suma > 20_000 && pole.suma < 40_000, `suma pól dzielnic ${pole?.suma} ha (Kraków ~32 700 ha)`);
});

naZywo("na żywo: nieznany host jest odrzucony przed pobraniem", async () => {
  await assert.rejects(plikOdczyt({ url: "https://example.com/dane.csv" }), /nie jest dozwolony/);
});

