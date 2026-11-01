import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import type { RaportAnalityczny } from "../shared/raport.ts";
import { bezpiecznyURL, LIMIT_RAPORTU, nazwaPliku, pakietRaportu, plikRaportu, raportHTML, raportJSON, tabelaCSV, trescRaportu, wczytajRaport } from "../shared/eksport-raportu.ts";

const raport = (): RaportAnalityczny => ({
  wersja: "1", tytul: "Usługi — Łagiewniki / Kraków 🏙️", pytanie: "Jak zmieniają się usługi?", utworzono: "2026-10-25T10:00:00Z", id_planu: "plan-123", plan: { pytanie: "Usługi", kroki: ["dane", "tabela"] }, zatwierdzenie: "Deklaracja w rozmowie",
  tabele: [{ id: "../usługi", tytul: "Usługi dzielnic", kolumny: ["dzielnica", "liczba", "zmiana"], wiersze: [{ dzielnica: "Łagiewniki 🏙️", liczba: 12.5, zmiana: -2 }, { dzielnica: "Dębniki", liczba: 3, zmiana: 1 }], zrodla: ["z1"], uwagi: ["Przykład testowy, nie rzeczywiste dane."] }],
  wykresy: [{ tabela: "../usługi", tytul: "Liczba usług", rodzaj: "slupki", kolumna_x: "dzielnica", kolumny_y: ["liczba"], jednostka: "obiektów" }],
  zrodla: [{ id: "z1", nazwa: "UMK", narzedzie: "dane_zapytaj", argumenty: { id: "test" }, pobrano: "2026-10-25T09:00:00Z", data_stanu: "2025", url: "https://krakow.pl/dane?x=1&y=2", definicja: "Usługi według rejestru", jednostka: "obiekty", poziom: "dzielnica", kompletne: false, uwagi: ["Brak danych o cenach."] }], metody: ["Suma wartości źródłowych"], ograniczenia: ["Niepełny rejestr"], wnioski: ["Nie można oszacować popytu."],
});

test("raport: roundtrip JSON zachowuje tabele, plan, źródła, Unicode i deklarację zatwierdzenia", () => {
  const r = raport();
  assert.deepEqual(wczytajRaport(raportJSON(r)), r);
  for (const format of ["json", "html", "zip"] as const) {
    const p = plikRaportu(r, format);
    assert.ok(p.dane.length > 100); assert.ok(p.nazwa.endsWith(`.${format}`)); assert.doesNotMatch(p.nazwa, /[/\\]/);
  }
});

test("raport: ZIP ma pełne HTML, JSON, README i CSV z tych samych tabel", () => {
  const r = raport();
  r.tabele.push({ ...r.tabele[0], id: "uslugi" });
  const pliki = unzipSync(pakietRaportu(r));
  assert.deepEqual(Object.keys(pliki).sort(), ["README.txt", "raport.html", "raport.json", "tabele/001-uslugi.csv", "tabele/002-uslugi.csv"]);
  assert.deepEqual(wczytajRaport(strFromU8(pliki["raport.json"])), r);
  assert.equal(strFromU8(pliki["raport.html"]), raportHTML(r));
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(pliki["tabele/001-uslugi.csv"]), tabelaCSV(r.tabele[0]));
  assert.deepEqual([...pliki["tabele/001-uslugi.csv"].slice(0, 3)], [239, 187, 191]);
  assert.match(strFromU8(pliki["README.txt"]), /PDF/);
  assert.match(strFromU8(pliki["README.txt"]), /nie uwierzytelniony dowód|nie jest uwierzytelnionym|a nie uwierzytelniony/);
});

test("CSV: separator PL, cudzysłowy, nowe wiersze, BOM i ochrona przed formułami", () => {
  const t = raport().tabele[0];
  t.kolumny = ["nazwa", "n"];
  t.wiersze = [
    { nazwa: '=HYPERLINK("https://evil.test";"x")', n: -2.5 },
    { nazwa: "  +SUM(A1)", n: 0 }, { nazwa: "\t@cmd", n: 1 },
    { nazwa: "-2+3", n: 2 }, { nazwa: "A; B\n\"Żółć\"", n: null },
    { nazwa: "\r=1", n: "@SUM(A1)" },
  ];
  const csv = tabelaCSV(t);
  assert.ok(csv.startsWith('\uFEFF"nazwa";"n"\r\n'));
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/evil\.test"";""x""\)";"-2,5"/);
  assert.match(csv, /"'  \+SUM\(A1\)"/); assert.match(csv, /"'\t@cmd"/);
  assert.match(csv, /"'-2\+3"/); assert.match(csv, /"A; B\n""Żółć""";""/);
  assert.match(csv, /"'\r=1";"'@SUM\(A1\)"/);
  assert.equal(nazwaPliku("../../CON"), "raport"); assert.equal(nazwaPliku("Łódź / Zażółć"), "Lodz-Zazolc");
});

test("HTML: wejście jest tekstem, URL nie uruchamia skryptu; dokument działa offline i drukuje źródła", () => {
  const r = raport(), atak = '</style><script>alert("XSS")</script><img src="https://evil.test/x" onerror="alert(1)">';
  r.tytul = atak; r.wnioski = [atak]; r.plan = { tekst: atak }; r.zrodla[0].url = "javascript:alert(1)";
  r.tabele[0].wiersze[0].dzielnica = atak;
  const html = raportHTML(r);
  assert.doesNotMatch(html, /<script|<img|href="javascript:/i);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /window\.print\(\)/);
  assert.match(html, /@media print/); assert.match(html, /<details open>/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /<svg[^>]*role="img"[^>]*aria-labelledby=/);
  assert.match(html, /<caption>/); assert.match(html, /scope="col"/);
  assert.match(html, /Data stanu/); assert.match(html, /Dane niepełne/);
  assert.match(html, /Metody/); assert.match(html, /Ograniczenia/); assert.match(html, /Argumenty pobrania/);
  assert.doesNotMatch(html, /<(?:link|iframe|img)|<[^>]*\bsrc=|url\(/i);
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///C:/test", "https://user:pass@example.test", "https://example.test/\n"]) assert.equal(bezpiecznyURL(url), undefined);
  assert.equal(bezpiecznyURL("https://krakow.pl/a?x=1&y=2"), "https://krakow.pl/a?x=1&y=2");
  assert.equal((html.match(/onclick=/g) ?? []).length, 1, "jedyny handler to stały wydruk, dane nie tworzą HTML");
});

test("import: odrzuca złą wersję, brak danych, nieznane źródła, powtórzone ID i niepoprawne typy", () => {
  const zmiany: ((r: any) => void)[] = [
    (r) => { r.wersja = "2"; }, (r) => { delete r.plan; }, (r) => { r.metody = "tekst"; },
    (r) => { r.tabele[0].zrodla = ["nieznane"]; }, (r) => { r.zrodla.push(r.zrodla[0]); },
    (r) => { r.tabele.push(r.tabele[0]); }, (r) => { r.tabele[0].wiersze = [[1, 2]]; },
    (r) => { r.tabele[0].kolumny.push("liczba"); }, (r) => { r.zrodla[0].kompletne = "tak"; },
    (r) => { r.utworzono = "wczoraj"; },
  ];
  for (const zmiana of zmiany) { const r = raport(); zmiana(r); assert.throws(() => wczytajRaport(JSON.stringify(r)), /Niepoprawny raport/); }
  assert.throws(() => wczytajRaport("{x"), /JSON/);
  assert.throws(() => wczytajRaport('{"__proto__":{"x":1}}'), /niedozwolony klucz/);
  assert.throws(() => wczytajRaport(" ".repeat(LIMIT_RAPORTU + 1)), /8 MiB/);
  assert.throws(() => wczytajRaport(JSON.stringify(raport()).replace('"liczba":12.5', '"liczba":1e999')), /liczba poza zakresem/);
});

test("import: limity złożoności, długości tekstu i liczby komórek", () => {
  const r = raport();
  r.tytul = "a".repeat(20001); assert.throws(() => wczytajRaport(JSON.stringify(r)), /20 tys/);
  r.tytul = "Test"; let gl: any = {}; r.plan = gl;
  for (let i = 0; i < 25; i++) { gl.x = {}; gl = gl.x; }
  assert.throws(() => wczytajRaport(JSON.stringify(r)), /złożona/);
  r.plan = {}; r.tabele[0].wiersze = Array.from({ length: 50001 }, () => ({ liczba: 1 }));
  assert.throws(() => wczytajRaport(JSON.stringify(r)), /wierszy/);
});

test("tabele i SVG biorą te same wartości, a brakujące liczby nie zamieniają się na zera na wykresie", () => {
  const r = raport(); r.tabele[0].wiersze.push({ dzielnica: "Brak", liczba: null, zmiana: null });
  const h = trescRaportu(r);
  assert.match(h, /<td>12,5<\/td>/); assert.match(h, /Usługi dzielnic/);
  assert.doesNotMatch(h, /<title>Brak,/); assert.match(h, /<td>Brak<\/td><td><\/td>/);
  r.tabele[0].wiersze = []; assert.doesNotMatch(trescRaportu(r), /NaN|Infinity|<svg/);
});

test("wykres: bez jawnego opisu nie zgadujemy miary ani etykiet", () => {
  const r = raport(); delete r.wykresy;
  assert.doesNotMatch(trescRaportu(r), /<svg/);
  r.wykresy = [{ tabela: "../usługi", tytul: "Błędna miara", rodzaj: "slupki", kolumna_x: "dzielnica", kolumny_y: ["objectid"] }];
  r.tabele[0].kolumny.push("objectid");
  assert.throws(() => raportJSON(r), /identyfikator/);
});

test("projekcja: rok jest osią X, a wartość osobną miarą Y", () => {
  const r = raport();
  r.tabele = [{ id: "projekcja", tytul: "Projekcja", kolumny: ["x", "wartosc", "dolna_95", "gorna_95"], wiersze: [{ x: 2026, wartosc: 16, dolna_95: 10, gorna_95: 22 }, { x: 2027, wartosc: 18, dolna_95: 11, gorna_95: 25 }], zrodla: ["z1"], uwagi: [] }];
  r.wykresy = [{ tabela: "projekcja", tytul: "Projekcja", rodzaj: "linia", kolumna_x: "x", kolumny_y: ["wartosc"] }];
  const h = trescRaportu(wczytajRaport(raportJSON(r)));
  assert.match(h, /data-seria="wartosc"/);
  assert.doesNotMatch(h, /data-seria="x"|<rect/);
  r.wykresy[0].kolumny_y = ["x"];
  assert.throws(() => raportJSON(r), /oś X/);
});

test("raport: kroki pośrednie są zwinięte, wyniki końcowe widoczne i pakiet zachowuje wszystko", () => {
  const r = raport();
  r.plan = { operacje: [{ id: "koniec", typ: "agreguj", z: "../usługi", miary: [{ nazwa: "liczba" }] }] };
  r.tabele.push({ ...r.tabele[0], id: "koniec", tytul: "Wynik końcowy" });
  const h = raportHTML(r);
  assert.ok(h.indexOf("<h2>Wynik końcowy") < h.indexOf("<summary>Dane źródłowe"));
  assert.match(h, /<details class="raport-szczegoly"><summary>Dane źródłowe/);
  assert.equal(Object.keys(unzipSync(pakietRaportu(r))).filter((p) => p.endsWith(".csv")).length, 2);
});
