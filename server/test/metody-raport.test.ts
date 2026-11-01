import { test } from "node:test";
import assert from "node:assert/strict";
import { trend, dzielnicaId } from "../src/analityka.ts";
import { statystyka } from "../src/analizy.ts";

test("trend: poprawka wariancji na remisy i stały szereg", () => {
  const t = trend([1, 1, 1, 2, 2, 3]);
  assert.equal(t.s, 11);
  assert.ok(Math.abs(t.wariancja_s! - 71 / 3) < 1e-9);
  assert.equal(trend([7, 7, 7, 7]).p, 1);
});

test("trend: nachylenie uwzględnia rzeczywiste odstępy czasu", () => {
  assert.equal(trend([2, 4, 8, 12], [2000, 2001, 2003, 2005]).nachylenie_sena, 2);
  assert.throws(() => trend([1, 2, 3, 4], [1, 2, 2, 4]), /rosnąc/);
  assert.throws(() => trend([1, 2, 3, 4], [1, 2, 3]), /długo/);
});

test("statystyka: brak obserwacji nie przesuwa etykiet ani czasu", () => {
  const r = statystyka({ operacja: "trend", x: [2, null, 6, 8, 10], etykiety: [2020, 2021, 2022, 2023, 2024], czas: [2020, 2021, 2022, 2023, 2024] });
  assert.equal((r as any).trend.nachylenie_sena, 2);
  assert.deepEqual(r.bloki.find((b: any) => b.typ === "wykres").punkty.map((p: any) => p.x), [2020, 2022, 2023, 2024]);
});

test("statystyka: różna długość par korelacji jest błędem", () => {
  assert.throws(() => statystyka({ operacja: "korelacja", x: [1, 2, 3], y: [1, 2] }), /długo/);
});

test("dzielnica: sprzeczny numer i nazwa nie są rozstrzygane po cichu", () => {
  assert.equal(dzielnicaId("IV Prądnik Czerwony"), null);
  assert.equal(dzielnicaId("XV Bieńczyce"), null);
  assert.equal(dzielnicaId("V Bronowice"), null);
  assert.equal(dzielnicaId("III Prądnik Czerwony"), 3);
});
