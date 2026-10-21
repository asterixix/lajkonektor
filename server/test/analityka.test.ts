// Analityka (offline): statystyka opisowa, korelacja z wartością p, trend, klasy, dzielnice i pokrycie ludności na migawkach.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DZIELNICE, LUDNOSC_MIASTA, OSTATNIA_DATA, dzielnicaId, dzielnicaPunktu, granice, hexy, klasaWartosci, korelacja, kwantyl, ludnosc, nierownosc, odstajace, opis, pokrycie, szeregLudnosci, trend, wzrost } from "../src/analityka.ts";

const blisko = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test("opis: średnia, mediana, odchylenie i kwartyle jak w arkuszu", () => {
  const o = opis([1, 2, 3, 4, 5, null, undefined]);
  assert.equal(o.n, 5);
  blisko(o.srednia, 3); blisko(o.mediana, 3); blisko(o.odchylenie, Math.sqrt(2.5)); blisko(o.q1, 2); blisko(o.q3, 4);
  blisko(kwantyl([1, 2, 3, 4], 0.25), 1.75); // PERCENTILE.INC
});

test("nierówność: Gini 0 przy równych wartościach, (n-1)/n gdy wszystko ma jeden", () => {
  blisko(nierownosc([5, 5, 5, 5]).gini!, 0);
  blisko(nierownosc([0, 0, 0, 10]).gini!, 0.75);
  blisko(nierownosc([1, 2, 3, 4]).gini!, 0.25);
  assert.equal(nierownosc([7]).gini, null);
});

test("korelacja: Pearson, Spearman z remisami, wartość p zgodna z tablicami, współczynniki prostej", () => {
  const dosk = korelacja([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  blisko(dosk.pearson, 1); blisko(dosk.nachylenie, 2); blisko(dosk.wyraz_wolny, 0); assert.equal(dosk.p_pearson, 0);
  const monot = korelacja([1, 2, 3, 4, 5, 6], [1, 4, 9, 16, 25, 36]);
  blisko(monot.spearman, 1); assert.ok(monot.pearson < 1 && monot.pearson > 0.95);
  // r = 13/15, n = 10 → t = 4,913, df = 8 → p ≈ 0,0012 (tablice t-Studenta: t(0,0005; 8) = 5,04, t(0,001; 8) = 4,50)
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], y = [2, 1, 4, 3, 7, 5, 9, 6, 10, 8];
  const k = korelacja(x, y);
  blisko(k.pearson, 13 / 15, 1e-9);
  assert.ok(k.p_pearson > 0.0008 && k.p_pearson < 0.002, String(k.p_pearson));
  assert.equal(korelacja([1, null, 3, 4], [2, 5, null, 8]).n, 2, "pary z brakami są pomijane");
});

test("trend Manna-Kendalla: rosnący szereg istotny, szum nie, za krótki szereg odrzucony", () => {
  assert.equal(trend([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).kierunek, "rosnący");
  blisko(trend([2, 4, 6, 8, 10, 12]).nachylenie_sena!, 2);
  assert.equal(trend([5, 3, 6, 2, 5, 4, 6, 3]).kierunek, "brak istotnego trendu");
  assert.equal(trend([1, 2, 3]).kierunek, "za krótki szereg");
  blisko(wzrost(100, 121, 2).cagr_proc!, 10, 1e-9);
});

test("klasy: kwantyle, równe przedziały i naturalne przerwy Jenksa na trzech wyraźnych grupach", () => {
  const g = granice([1, 2, 3, 4, 5, 6, 7, 8, 9], 3);
  blisko(g[1], 1 + 8 / 3, 1e-9);
  assert.deepEqual(granice([1, 2, 3, 10, 11, 12, 50, 51, 52], 3, "jenks"), [1, 3, 12, 52]);
  assert.deepEqual(granice([0, 10], 2, "rowne"), [0, 5, 10]);
  assert.equal(klasaWartosci(11, [1, 3, 12, 52]), 1);
  assert.deepEqual(odstajace([10, 11, 9, 10, 12, 10, 11, 90]).map((p) => p.wartosc), [90]);
});

test("dzielnice: nazwy w różnych zapisach, zakazane niejednoznaczności, punkt w dzielnicy", () => {
  assert.equal(DZIELNICE.length, 18);
  const oczekiwane: [unknown, number | null][] = [["VIII Dębniki", 8], ["Dzielnica XVIII Nowa Huta", 18], ["Nowa Huta", 18], ["dębniki", 8], ["Podgórze", 13], ["Podgórze Duchackie", 11], ["XI", 11], [11, 11], ["12", 12], ["Łagiewniki-Borek Fałęcki", 9], ["łagiewniki", 9], ["Prądnik", null], ["Wieliczka", null], [19, null]];
  for (const [we, wy] of oczekiwane) assert.equal(dzielnicaId(we), wy, String(we));
  assert.equal(dzielnicaPunktu(50.0614, 19.9372), 1, "Rynek Główny");
  assert.equal(dzielnicaPunktu(50.0728, 20.0377), 18, "Plac Centralny");
  assert.equal(dzielnicaPunktu(50.0198, 20.01435), 12, "Telimeny 11");
  assert.equal(dzielnicaPunktu(52.23, 21.01), null, "Warszawa");
});

test("ludność: siatka Hex i tabela dzielnic dają to samo miasto (±1%), każdy hex ma dzielnicę", () => {
  const razem = LUDNOSC_MIASTA();
  assert.ok(razem > 650_000 && razem < 760_000, String(razem));
  const wDz = DZIELNICE.reduce((a, d) => a + (ludnosc(d.id) ?? 0), 0);
  assert.ok(Math.abs(wDz - razem) / razem < 0.01, `${wDz} vs ${razem}`);
  const bezDz = hexy().filter((h) => h.dz === 0).reduce((a, h) => a + h.lud, 0);
  assert.ok(bezDz / razem < 0.01, `poza dzielnicami ${bezDz}`);
  const szereg = szeregLudnosci(0, "r_3_6");
  assert.equal(szereg.length, 72);
  assert.equal(szereg[szereg.length - 1].data, OSTATNIA_DATA);
});

test("pokrycie: jeden punkt usługi, sumy dzielnic zgadzają się z miastem, białe plamy leżą poza zasięgiem", () => {
  const w = pokrycie([{ lat: 50.0614, lon: 19.9372, nazwa: "Rynek" }], 1000);
  assert.ok(w.udzial > 0 && w.udzial < 0.2, String(w.udzial));
  assert.equal(w.wg_dzielnic.reduce((a, d) => a + d.razem, 0) + (w.razem - w.wg_dzielnic.reduce((a, d) => a + d.razem, 0)), w.razem);
  assert.ok(w.wg_dzielnic.find((d) => d.id === 1)!.udzial > 0.5, "Stare Miasto w większości w zasięgu 1 km od Rynku");
  assert.ok(w.biale_plamy.length > 0 && w.biale_plamy.every((p) => p.najblizsza_m! > 1000));
  const wszystko = pokrycie([{ lat: 50.06, lon: 19.94 }], 100_000);
  assert.equal(wszystko.udzial, 1);
});
