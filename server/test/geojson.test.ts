import { test } from "node:test";
import assert from "node:assert/strict";
import { eksportGeoJSON, warstwaGIS } from "../src/geojson.ts";

const ID = "msip:Transport/ZTP_Komunikacja_Miejska_i_Rowerowa/5";
const cecha = (i: number) => ({ type: "Feature", id: i, geometry: { type: "Point", coordinates: [19.9 + i / 1e6, 50.06] }, properties: { objectid: i } });

// Atrapa ArcGIS: liczba obiektów, potem strony według resultOffset/resultRecordCount.
function zrodlo(razem: number, o: { blad?: number; urwij?: number } = {}) {
  const adresy: string[] = [];
  const fetchFn = (async (u: string) => {
    adresy.push(u);
    const q = new URL(u).searchParams;
    if (q.get("returnCountOnly")) return Response.json({ count: razem });
    const od = Number(q.get("resultOffset")), ile = Number(q.get("resultRecordCount"));
    if (o.blad === od) return Response.json({ error: { code: 400, message: "Error performing query operation" } });
    const koniec = Math.min(razem, o.urwij ?? razem);
    return Response.json({ type: "FeatureCollection", features: Array.from({ length: Math.max(0, Math.min(ile, koniec - od)) }, (_, k) => cecha(od + k + 1)) });
  }) as unknown as typeof fetch;
  return { fetchFn, adresy };
}

test("GeoJSON: wszystkie strony w jednym pliku, pełna geometria WGS84 i metadane pochodzenia", async () => {
  const { fetchFn, adresy } = zrodlo(5);
  const r = await eksportGeoJSON(ID, { fetchFn, strona: 2 });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type")!, /application\/geo\+json/);
  assert.match(r.headers.get("content-disposition")!, /attachment; filename=".+\.geojson"/);
  const j = JSON.parse(await r.text());
  assert.equal(j.type, "FeatureCollection");
  assert.deepEqual(j.features.map((f: any) => f.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(j.features[0].geometry.coordinates, [19.900001, 50.06]);
  assert.equal(j.lajkonektor.obiektow, 5);
  assert.match(j.lajkonektor.usluga, /^https:\/\/msip3\.um\.krakow\.pl\/.+\/MapServer\/5$/);
  const strony = adresy.filter((u) => u.includes("f=geojson"));
  assert.equal(strony.length, 3);
  for (const u of strony) assert.match(u, /outSR=4326/);
  assert.ok(strony.every((u) => u.includes("orderByFields=objectid")), "stałe sortowanie stron");
});

test("GeoJSON: błąd ArcGIS w HTTP 200 lub urwana warstwa przerywa plik zamiast oddać go jako pełny", async () => {
  for (const o of [{ blad: 2 }, { urwij: 3 }]) {
    const r = await eksportGeoJSON(ID, { fetchFn: zrodlo(5, o).fetchFn, strona: 2 });
    await assert.rejects(r.text(), JSON.stringify(o));
  }
});

test("GeoJSON: tylko warstwy mapy z katalogu, limit obiektów zanim cokolwiek zostanie pobrane", async () => {
  assert.equal((await eksportGeoJSON("https://evil.example/x")).status, 404);
  assert.equal((await eksportGeoJSON("od:OD-SrodowiskoParkiMiejskie/parki-miejskie-powierzchnia")).status, 404);
  assert.equal(warstwaGIS(ID)?.geometria, "Point");
  const { fetchFn, adresy } = zrodlo(10);
  const r = await eksportGeoJSON(ID, { fetchFn, limit: 9 });
  assert.equal(r.status, 413);
  assert.match((await r.json() as any).blad, /ArcGIS REST/);
  assert.equal(adresy.length, 1, "po przekroczeniu limitu nie pobiera stron");
});
