import { test } from "node:test";
import assert from "node:assert/strict";
import { pomocnicza } from "../src/pomocnicza.ts";

test("pomocnicza karta jest zamknięta i zawiera tylko bezpieczne podsumowanie", () => {
  const html = pomocnicza({ podsumowanie: '<img src=x onerror="alert(1)">', bloki: [{ typ: "mapa" }] });
  assert.match(html, /<details class="wynik-pomocniczy">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b|<img|<svg|<canvas/);
  assert.match(html, /&lt;img/);
  assert.match(html, /data-pomocnicza/);
});
