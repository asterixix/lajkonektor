// Proxy kafelków OSM: ograniczenia obszaru i zoomu (offline); sam pobór z osm.org nie jest testowany, żeby nie obciążać ich serwerów.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kafelWObszarze, kafelek } from "../src/kafelki.ts";

const x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const y = (lat: number, z: number) => { const s = Math.sin((lat * Math.PI) / 180); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };

test("kafelki: Rynek w Krakowie na zoomach 9-18 jest dozwolony, Warszawa i skrajne zoomy nie", () => {
  for (let z = 9; z <= 18; z++) assert.ok(kafelWObszarze(z, x(19.9372, z), y(50.0614, z)), `z=${z}`);
  assert.ok(!kafelWObszarze(16, x(21.0122, 16), y(52.2297, 16)), "Warszawa");
  assert.ok(!kafelWObszarze(8, x(19.9372, 8), y(50.0614, 8)), "za mały zoom");
  assert.ok(!kafelWObszarze(19, x(19.9372, 19), y(50.0614, 19)), "za duży zoom");
  assert.ok(!kafelWObszarze(16, 1.5, 2), "liczby niecałkowite");
});

test("kafelki: ścieżka spoza obszaru lub w złym formacie daje 404 bez pytania osm.org", async () => {
  for (const p of ["/kafelki/16/0/0.png", "/kafelki/abc/1/1.png", "/kafelki/16/36397/22208.jpg", "/kafelki/16/36397/22208.png/../x"]) assert.equal((await kafelek(p)).status, 404, p);
});
