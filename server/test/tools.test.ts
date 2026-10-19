// Testy integracyjne na żywych API miasta (wymagają internetu). Uruchom: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressToPoint } from "../src/adres.ts";
import { pozycje, szukaj } from "../src/katalog.ts";
import { parkGeometry } from "../src/parki.ts";
import { agreguj, daneZapytaj, sortuj, zbiorOpis } from "../src/zapytanie.ts";
import { bdlDane, bdlSzukaj, daneGovSzukaj } from "../src/zewnetrzne.ts";

const BLONIA = { lat: 50.0585, lon: 19.9186 };
const RYNEK = { lat: 50.0614, lon: 19.9372 };
const HEX = "msip:Demografia/Elud_Hex100/1";
const MPZP = "msip:Planowanie/BP_MPZP/3";
const PARKI_OD = "od:OD-SrodowiskoParkiMiejskie/parki-miejskie-powierzchnia";

// --- katalog (offline)
test("katalog: duży i znajduje po temacie (parki, cudzoziemcy, plan miejscowy, hałas)", () => {
  assert.ok(pozycje.length > 1000);
  assert.ok(szukaj("parki miejskie").some((p) => p.id === PARKI_OD));
  assert.ok(szukaj("cudzoziemcy pobyt czasowy", { zrodlo: "od" }).length > 0);
  assert.ok(szukaj("miejscowy plan zagospodarowania").some((p) => p.id.startsWith("msip:Planowanie/BP_MPZP")));
  assert.ok(szukaj("halas").length > 0, "diakrytyki: 'halas' powinno znaleźć 'hałas'");
  assert.ok(szukaj("bezrobocie").length > 0, "stemming: 'bezrobocie' ~ 'bezrobotni'");
});

test("agregacja po stronie serwera: grupowanie i funkcje", () => {
  const rows = [{ g: "a", v: 1 }, { g: "a", v: 3 }, { g: "b", v: 10 }];
  const r = agreguj(rows, ["g"], [{ fn: "sum", pole: "v" }, { fn: "avg", pole: "v", nazwa: "sr" }, { fn: "count", pole: "v" }]);
  assert.deepEqual(r, [{ g: "a", sum_v: 4, sr: 2, count_v: 2 }, { g: "b", sum_v: 10, sr: 10, count_v: 1 }]);
});

test("sortowanie: kolumna ze spacjami w nazwie, puste wartości zawsze na końcu", () => {
  const rows = [{ "Cena m 2 [zł]": null }, { "Cena m 2 [zł]": 10 }, { "Cena m 2 [zł]": 30 }, { "Cena m 2 [zł]": "" }, { "Cena m 2 [zł]": 20 }];
  assert.deepEqual(sortuj(rows, "Cena m 2 [zł] desc").map((r) => r["Cena m 2 [zł]"]), [30, 20, 10, null, ""]);
  assert.deepEqual(sortuj(rows, "Cena m 2 [zł]").map((r) => r["Cena m 2 [zł]"]), [10, 20, 30, null, ""]);
});

// --- OD
test("OD: filtr, pola i agregacja po dzielnicy (parki)", async () => {
  const wszystkie = await daneZapytaj({ id: PARKI_OD, limit: 200 });
  assert.ok(wszystkie.wiersze_zwrocone >= 70);
  const dz = await daneZapytaj({ id: PARKI_OD, filtr: "Dzielnica eq 'VIII Dębniki'", pola: ["Nazwa"] });
  assert.ok(dz.wiersze_zwrocone > 0 && dz.wiersze_zwrocone < wszystkie.wiersze_zwrocone);
  const agg = await daneZapytaj({ id: PARKI_OD, grupuj_po: ["Dzielnica"], agreguj: [{ fn: "sum", pole: "Powierzchnia_ha", nazwa: "ha" }] });
  assert.ok(agg.wiersze.length > 10 && agg.wiersze.every((w: any) => w.ha > 0));
});

test("OD: stronicowanie kursorem", async () => {
  const a = await daneZapytaj({ id: PARKI_OD, limit: 5 });
  assert.equal(a.wiersze_zwrocone, 5);
  assert.ok(a.nastepny_kursor);
  const b = await daneZapytaj({ id: PARKI_OD, limit: 5, kursor: a.nastepny_kursor as string });
  assert.notDeepEqual(a.wiersze[0], b.wiersze[0]);
});

test("zbior_opis: OD ma próbkę, MSIP ma liczbę obiektów", async () => {
  const od = await zbiorOpis(PARKI_OD);
  assert.equal((od as any).probka.length, 3);
  const m = await zbiorOpis(MPZP);
  assert.ok((m as any).liczba_obiektow > 1000);
});

// --- MSIP
test("MSIP: punkt → przeznaczenie MPZP (Błonia), bez geometrii domyślnie", async () => {
  const r = await daneZapytaj({ id: MPZP, pola: ["nazwa_mpzp", "oznaczenie", "opis_oznac"], geometria: { punkt: BLONIA } });
  assert.ok(r.wiersze_zwrocone > 0);
  assert.ok(r.wiersze.every((w: any) => !("_geometria" in w)));
});

test("MSIP: agregacja z promieniem rośnie wraz z promieniem (ludność w heksagonach)", async () => {
  const q = (promien_m: number) =>
    daneZapytaj({ id: HEX, filtr: "na_dzien_txt = '2026-09-30'", geometria: { punkt: RYNEK, promien_m }, agreguj: [{ fn: "sum", pole: "r_ogolem", nazwa: "suma" }] });
  const a = await q(300), b = await q(800);
  assert.ok((a.wiersze[0] as any).suma > 0 && (b.wiersze[0] as any).suma >= (a.wiersze[0] as any).suma);
});

test("MSIP: zwroc_geometrie daje środek i ramkę, daty jako tekst", async () => {
  const r = await daneZapytaj({ id: HEX, filtr: "na_dzien_txt = '2026-09-30'", limit: 2, zwroc_geometrie: true });
  const w: any = r.wiersze[0];
  assert.ok(w._geometria.srodek.lat > 49.9);
  assert.match(String(w.na_dzien), /^\d{4}-\d{2}-\d{2}$/);
});

test("złączenie przestrzenne: mieszkańcy w zasięgu parków (OSM) są podzbiorem mieszkańców miasta", async () => {
  const filtr = "na_dzien_txt = '2026-09-30'";
  const miasto = await daneZapytaj({ id: HEX, filtr, agreguj: [{ fn: "sum", pole: "r_ogolem", nazwa: "suma" }] });
  const przy = await daneZapytaj({ id: HEX, filtr, geometria: { z: { id: "lokalne:parki_osm", bufor_m: 300 } }, agreguj: [{ fn: "sum", pole: "r_ogolem", nazwa: "suma" }] });
  const m = (miasto.wiersze[0] as any).suma, p = (przy.wiersze[0] as any).suma;
  assert.ok(p > 0 && p < m, `w zasięgu parków ${p}, miasto ${m}`);
});

test("złączenie przestrzenne: obiekty innej warstwy MSIP jako obszar (ZP w MPZP)", async () => {
  const r = await daneZapytaj({
    id: HEX, filtr: "na_dzien_txt = '2026-09-30'",
    geometria: { z: { id: MPZP, where: "oznaczenie LIKE 'ZP%' AND nazwa_mpzp LIKE '%BŁONIA%'", bufor_m: 100 } },
    agreguj: [{ fn: "sum", pole: "r_ogolem", nazwa: "suma" }],
  });
  assert.ok((r.wiersze[0] as any).suma > 0);
});

test("błędy: nieznany zbiór i filtr przestrzenny dla OD", async () => {
  await assert.rejects(daneZapytaj({ id: "msip:nie/ma/1" }), /Nieznany zbiór/);
  await assert.rejects(daneZapytaj({ id: PARKI_OD, geometria: { punkt: BLONIA } }), /tylko dla warstw MSIP/);
});

// --- adresy i parki
test("adres_na_punkt: Telimeny 11, bez polskich liter, brak wyniku", async () => {
  const a = await addressToPoint({ ulica: "ul. Telimeny", numer: "11" });
  assert.equal(a.liczba, 1);
  assert.equal(a.kandydaci[0].kod_pocztowy, "30-838");
  assert.ok((await addressToPoint({ ulica: "Lojasiewicza", numer: "4" })).liczba >= 1);
  assert.ok((await addressToPoint({ ulica: "Dabrowskiego", numer: "12" })).liczba >= 1);
  assert.equal((await addressToPoint({ ulica: "Nieistniejaca", numer: "999" })).liczba, 0);
});

test("parki_geometria: pokrycie jawne, Błonia mają środek w Krakowie", () => {
  const r = parkGeometry({ nazwa: "Błonia" });
  assert.ok(r.pokrycie.parki_z_geometria > 30 && r.pokrycie.parki_z_geometria < r.pokrycie.parki_ogolem);
  const b = r.parki[0];
  assert.ok(b.osm && Math.abs(b.osm.srodek.lat - 50.058) < 0.01 && Math.abs(b.osm.srodek.lon - 19.918) < 0.01);
});

// --- zewnętrzne
test("BDL: szukaj stopy bezrobocia i pobierz szereg dla Krakowa", async () => {
  const s = await bdlSzukaj("stopa bezrobocia", 5);
  assert.ok(s.zmienne.length > 0 && s.zmienne.every((v: any) => v.nazwa));
  const d = await bdlDane({ zmienne: [60270], jednostka: "powiat", lata: [2022, 2023] });
  assert.match(d.jednostka, /Kraków/);
  assert.deepEqual(d.wiersze.map((w: any) => w.rok), [2022, 2023]);
  assert.ok(d.wiersze.every((w: any) => typeof w.wartosc === "number"));
});

test("dane.gov.pl: wyszukiwanie zbiorów zwraca tytuły i linki", async () => {
  const r = await daneGovSzukaj("Kraków parki", 3);
  assert.ok(r.zbiory.length > 0 && r.zbiory[0].url.startsWith("https://dane.gov.pl/"));
});

test("MSIP: warstwy z błędnym stronicowaniem (Studium K1, mapy powodziowe) nadal zwracają dane", async () => {
  const r = await daneZapytaj({ id: "msip:Planowanie/BP_STUDIUM_K1/0", geometria: { punkt: { lat: 50.0198, lon: 20.01435 } }, limit: 3 });
  assert.ok(r.wiersze_zwrocone >= 1, "Studium K1 w punkcie Telimeny 11");
  const f = await daneZapytaj({ id: "msip:Mapy_powodziowe/Mapy_zagrozenia_powodziowego/43", geometria: { punkt: { lat: 50.0198, lon: 20.01435 } }, limit: 3 });
  assert.ok(Array.isArray(f.wiersze));
});

test("katalog: tematy potoczne trafiają w warstwy planistyczne i transportowe", () => {
  assert.ok(szukaj("plan zagospodarowania przestrzennego").some((p) => p.id.includes("Planowanie/")));
  assert.ok(szukaj("komunikacja miejska przystanki").some((p) => p.id.includes("Transport/") || p.id.includes("KCK_przystanki")));
});

test("katalog: 'przedszkola' nie zwraca szkół muzycznych na szczycie", () => {
  const top = szukaj("przedszkola", { limit: 5 }).map((p) => p.id.toLowerCase());
  assert.ok(top.some((id) => id.includes("przedszk")), `brak przedszkoli w top5: ${top.join(" | ")}`);
  assert.ok(!top[0].includes("muzyczne"), "szkoły muzyczne na pierwszym miejscu");
});

test("OD: agregacja z sortowaniem po kolumnie agregatu i limitem (regresja: 400 z $orderby=ha)", async () => {
  const r = await daneZapytaj({ id: PARKI_OD, grupuj_po: ["Dzielnica"], agreguj: [{ fn: "sum", pole: "Powierzchnia_ha", nazwa: "ha" }], sortuj: "ha desc", limit: 3 });
  assert.equal(r.wiersze.length, 3);
  assert.ok((r.wiersze[0] as any).ha >= (r.wiersze[1] as any).ha && (r.wiersze[1] as any).ha >= (r.wiersze[2] as any).ha);
  assert.deepEqual(sortuj([{ a: 1 }, { a: 3 }, { a: 2 }], "a desc").map((x) => x.a), [3, 2, 1]);
});

test("parki_geometria: żaden kontur OSM nie jest przypisany do dwóch parków (regresja: Planty Bieńczyckie i Krakowskie)", () => {
  const r = parkGeometry({ tylko_z_geometria: true });
  const id = r.parki.map((p) => p.osm!.id);
  assert.equal(new Set(id).size, id.length, "powtórzony kontur OSM");
  const b = parkGeometry({ nazwa: "Planty Bieńczyckie" }).parki[0];
  assert.equal(b.osm, null, "Planty Bieńczyckie nie mogą dostać konturu Plant Krakowskich");
  assert.ok(parkGeometry({ nazwa: "Planty Krakowskie" }).parki[0].osm, "Planty Krakowskie zachowują kontur");
});
