import { test } from "node:test";
import assert from "node:assert/strict";

function lum(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const kontrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("tekst podstawowy na bialym ma co najmniej 4,5:1", () => {
  assert.ok(kontrast("#071F32", "#FFFFFF") >= 4.5);
  assert.ok(kontrast("#505050", "#FFFFFF") >= 4.5);
});

test("bialy tekst na niebieskim i ciemny tekst na zoltym CTA maja co najmniej 4,5:1", () => {
  assert.ok(kontrast("#FFFFFF", "#0063AF") >= 4.5);
  assert.ok(kontrast("#071F32", "#FFCC00") >= 4.5);
});

test("ramka pola i przycisku ma co najmniej 3:1 (1.4.11)", () => {
  assert.ok(kontrast("#767676", "#FFFFFF") >= 3);
});

test("szara linia dekoracyjna nie jest uzywana jako ramka elementu interfejsu", () => {
  assert.ok(kontrast("#BFBFBF", "#FFFFFF") < 3);
});
