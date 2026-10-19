// Testy kart (offline): każdy widok renderuje się z prawdziwych wyników narzędzi zapisanych w test/fixtury.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { WIDOKI } from "../src/widoki/rejestr.ts";
import { blad, ladowanie, ogolny } from "../src/widoki/stany.ts";
import type { Ctx } from "../src/widoki/typy.ts";

const katalog = new URL("../../test/fixtury/", import.meta.url);
const ctx: Ctx = { wywolaj: async () => ({}), pokaz() {}, przerysuj() {}, otworz() {}, czyMoznaWolac: true };
const fixtury = readdirSync(katalog).filter((f) => f.endsWith(".json")).map((f) => [f, JSON.parse(readFileSync(new URL(f, katalog), "utf-8"))] as const);

// Takie napisy w HTML oznaczają dziurę w danych albo błąd w szablonie.
const USTERKI = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\bnull\b/];

test("karty: każdy widok z rejestru ma fixturę", () => {
  const pokryte = new Set(fixtury.map(([, d]) => d._widok).filter(Boolean));
  for (const nazwa of Object.keys(WIDOKI)) assert.ok(pokryte.has(nazwa), `brak fixtury dla widoku ${nazwa}`);
});

for (const [plik, dane] of fixtury) {
  if (dane._widok) {
    test(`karta ${dane._widok} (${plik}): render bez dziur w danych i ze stopką`, () => {
      const html = WIDOKI[dane._widok as keyof typeof WIDOKI].render(dane, ctx);
      assert.ok(html.length > 200);
      for (const u of USTERKI) assert.doesNotMatch(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ""), u, `${plik}: ${u}`);
      assert.match(html, /<footer class="stopka"/, "każda karta ma stopkę ze źródłem");
    });
  }
}

test("karta błędu: długi adres nie wychodzi poza kartę, jest przycisk statusu źródeł", () => {
  const f = fixtury.find(([p]) => p === "blad_522.json")![1];
  const html = blad("adres_na_punkt", f.tekst, ctx);
  assert.match(html, /522/);
  assert.match(html, /data-status/);
});

test("stany: ładowanie i nieznany widok nie rzucają wyjątku", () => {
  assert.match(ladowanie("odjazdy"), /\S/);
  assert.match(ogolny("cos_nowego", { a: 1 }), /cos_nowego/);
});
