// Mapa SVG: rzutowanie Web Mercator, kafelki OSM tylko gdy wynik niesie adres, napisy skalowane razem z widokiem.
import { test } from "node:test";
import assert from "node:assert/strict";
import { konfiguracja, mapa } from "../src/mapa.ts";

const punkty = [{ lat: 50.0614, lon: 19.9372, etykieta: "Rynek" }, { lat: 50.0647, lon: 19.9450, etykieta: "Dworzec" }];
const zoom = (h: string) => +h.match(/kafelki\/(\d+)\//)![1];

test("mapa: bez adresu kafelków rysuje dane na szarym tle, bez zewnętrznych obrazów", () => {
  konfiguracja.kafelki = undefined;
  const html = mapa({ punkty, opis: "test" });
  assert.doesNotMatch(html, /<image/);
  assert.match(html, /viewBox="0 0 \d+ \d+"/);
  assert.match(html, /Rynek/);
});

test("mapa: z adresem rysuje kafelki o stałym zoomie, podpis OSM i skalę", () => {
  konfiguracja.kafelki = "https://serwer.test/kafelki/{z}/{x}/{y}.png";
  const html = mapa({ punkty, opis: "test" });
  const adresy = [...html.matchAll(/<image href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(adresy.length >= 2 && adresy.length <= 30, String(adresy.length));
  assert.ok(adresy.every((u) => /^https:\/\/serwer\.test\/kafelki\/\d+\/\d+\/\d+\.png$/.test(u)));
  assert.equal(new Set(adresy.map((u) => u.split("/")[4])).size, 1, "jeden zoom");
  assert.match(html, /współtwórcy OpenStreetMap/);
  assert.match(html, /class="skala"/);
  konfiguracja.kafelki = undefined;
});

test("mapa: pojedynczy punkt nie przybliża w nieskończoność, a duży obszar oddala się tak, by mieścił się w widoku", () => {
  konfiguracja.kafelki = "https://serwer.test/kafelki/{z}/{x}/{y}.png";
  assert.ok(zoom(mapa({ punkty: [punkty[0]], opis: "t" })) <= 17);
  const miasto = mapa({ punkty: [{ lat: 49.95, lon: 19.8 }, { lat: 50.15, lon: 20.2 }], opis: "t" });
  assert.ok(zoom(miasto) <= 12, "obszar 30 km");
  konfiguracja.kafelki = undefined;
});
